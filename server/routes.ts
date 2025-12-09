import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import { DBStorage } from "./db-storage";
import { createDocumentAIService } from "./services/document-ai";
import { createClassifierService } from "./services/classifier";
import { createPDFProcessorService } from "./services/pdf-processor";
import { LayoutAnalyzer } from "./services/layout-analyzer";
import { SignatureAnalyzer } from "./services/signature-analyzer";
import { ValidationEngine } from "./services/validation-engine";
import { VisualAnalyzer } from "./services/visual-analyzer";
import { setupAuth, isAuthenticated } from "./replitAuth";
import type { ProcessingEventType } from "@shared/schema";

// Use PostgreSQL database storage for persistence
const storage = new DBStorage();

// Generate placeholder SVG for missing page images
function generatePlaceholderSVG(pageNumber: number, message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1100" viewBox="0 0 800 1100">
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  <rect x="20" y="20" width="760" height="1060" fill="#ffffff" stroke="#e0e0e0" stroke-width="2" rx="8"/>
  <g transform="translate(400, 450)">
    <circle cx="0" cy="0" r="60" fill="none" stroke="#9e9e9e" stroke-width="3"/>
    <path d="M-25,-15 L25,-15 L25,25 L-25,25 Z" fill="none" stroke="#9e9e9e" stroke-width="2"/>
    <circle cx="0" cy="-5" r="8" fill="none" stroke="#9e9e9e" stroke-width="2"/>
    <path d="M-20,15 Q0,-5 20,15" fill="none" stroke="#9e9e9e" stroke-width="2"/>
  </g>
  <text x="400" y="560" font-family="system-ui, sans-serif" font-size="18" fill="#666666" text-anchor="middle">
    ${message}
  </text>
  <text x="400" y="600" font-family="system-ui, sans-serif" font-size="24" fill="#333333" text-anchor="middle" font-weight="600">
    Page ${pageNumber}
  </text>
  <text x="400" y="640" font-family="system-ui, sans-serif" font-size="14" fill="#999999" text-anchor="middle">
    PDF-to-image conversion may have failed
  </text>
</svg>`;
}

// Audit trail helper
async function logEvent(
  eventType: ProcessingEventType,
  status: "pending" | "success" | "failed",
  options: {
    documentId?: string | null;
    pageId?: string | null;
    userId?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, any>;
  } = {}
) {
  try {
    await storage.createProcessingEvent({
      eventType,
      status,
      documentId: options.documentId ?? null,
      pageId: options.pageId ?? null,
      userId: options.userId ?? null,
      errorMessage: options.errorMessage ?? null,
      metadata: options.metadata || {},
    });
  } catch (err) {
    console.error("Failed to log processing event:", err);
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  await setupAuth(app);

  const documentAI = createDocumentAIService();
  const classifier = createClassifierService();
  const pdfProcessor = createPDFProcessorService();
  const layoutAnalyzer = new LayoutAnalyzer();
  const signatureAnalyzer = new SignatureAnalyzer();
  const validationEngine = new ValidationEngine();
  const visualAnalyzer = new VisualAnalyzer('uploads/thumbnails');

  // Auth routes - returns user if authenticated, null if not (does NOT require auth)
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated() || !req.user?.claims?.sub) {
        return res.json(null);
      }
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user || null);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.json(null);
    }
  });

  // Get processing events for a document (audit trail)
  app.get("/api/documents/:id/events", isAuthenticated, async (req, res) => {
    try {
      const events = await storage.getEventsByDocument(req.params.id);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all recent processing events with user info
  app.get("/api/events/recent", isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const events = await storage.getRecentEvents(limit);
      
      // Attach user info to each event
      const eventsWithUsers = await Promise.all(
        events.map(async (event) => {
          let user = null;
          if (event.userId) {
            user = await storage.getUser(event.userId);
          }
          return { ...event, user };
        })
      );
      
      res.json(eventsWithUsers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get failed processing events
  app.get("/api/events/failed", isAuthenticated, async (req, res) => {
    try {
      const events = await storage.getFailedEvents();
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Upload and process document (requires authentication)
  app.post("/api/documents/upload", isAuthenticated, upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({ error: "Only PDF files are supported" });
      }

      // Get user ID if authenticated
      const userId = req.user?.claims?.sub || null;

      // Create document record with uploadedBy
      const doc = await storage.createDocument({
        filename: req.file.originalname,
        fileSize: req.file.size,
        status: "pending",
      }, userId);

      // Log upload event
      await logEvent("document_upload", "success", {
        documentId: doc.id,
        userId,
        metadata: {
          filename: req.file.originalname,
          fileSize: req.file.size,
        },
      });

      // Start processing asynchronously
      processDocument(doc.id, req.file.buffer, userId).catch(error => {
        console.error("Error processing document:", error);
        storage.updateDocument(doc.id, {
          status: "failed",
          errorMessage: error.message,
        });
        // Log processing failure
        logEvent("processing_failed", "failed", {
          documentId: doc.id,
          userId,
          errorMessage: error.message,
        });
      });

      res.json(doc);
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all documents with uploader info
  app.get("/api/documents", async (_req, res) => {
    try {
      const documents = await storage.getAllDocuments();
      
      // Fetch uploader info for each document
      const documentsWithUploader = await Promise.all(
        documents.map(async (doc) => {
          let uploaderName = null;
          if (doc.uploadedBy) {
            const user = await storage.getUser(doc.uploadedBy);
            if (user) {
              uploaderName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Unknown';
            }
          }
          return { ...doc, uploaderName };
        })
      );
      
      res.json(documentsWithUploader);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get user info by ID
  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profileImageUrl: user.profileImageUrl,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Dashboard summary endpoint - aggregates validation metrics across documents
  // Uses same validation logic as /api/documents/:id/validation for consistency
  app.get("/api/dashboard/summary", async (_req, res) => {
    try {
      const documents = await storage.getAllDocuments();
      const completedDocs = documents.filter(d => d.status === "completed");
      
      // Initialize category metrics
      const categories = {
        signatures: { passed: 0, failed: 0, total: 0 },
        dataIntegrity: { passed: 0, failed: 0, total: 0 },
        calculations: { passed: 0, failed: 0, total: 0 },
        dates: { passed: 0, failed: 0, total: 0 },
        batchNumbers: { passed: 0, failed: 0, total: 0 },
        pageCompleteness: { passed: 0, failed: 0, total: 0 },
      };
      
      let totalPages = 0;
      let totalAlerts = 0;
      let documentsWithIssues = 0;
      
      // Process each completed document using the SAME logic as /api/documents/:id/validation
      for (const doc of completedDocs) {
        const pages = await storage.getPagesByDocument(doc.id);
        totalPages += pages.length;
        
        let docHasIssues = false;
        let docHasPageCompletenessIssue = false;
        
        // Run validation on all pages (same as validation endpoint)
        const pageResults = await Promise.all(
          pages.map(async (page) => {
            const result = await validationEngine.validatePage(
              page.pageNumber,
              page.metadata || {},
              page.classification,
              page.extractedText || ""
            );
            
            const metadata = page.metadata as Record<string, any> || {};
            
            // Add visual anomaly alerts
            if (metadata.visualAnomalies && Array.isArray(metadata.visualAnomalies) && metadata.visualAnomalies.length > 0) {
              const visualAlerts = validationEngine.createVisualAnomalyAlerts(metadata.visualAnomalies);
              result.alerts.push(...visualAlerts);
            }
            
            // Run signature analysis
            let signatureFields: any[] | null = null;
            if (metadata.extraction) {
              try {
                const approvalAnalysis = signatureAnalyzer.analyze({
                  tables: metadata.extraction.tables,
                  handwrittenRegions: metadata.extraction.handwrittenRegions,
                  signatures: metadata.extraction.signatures,
                  formFields: metadata.extraction.formFields,
                  textBlocks: metadata.extraction.textBlocks || metadata.layoutAnalysis?.textBlocks,
                });
                signatureFields = approvalAnalysis.signatureFields;
              } catch (err) {
                console.error(`Signature analysis failed for page ${page.pageNumber}:`, err);
                signatureFields = metadata.approvals?.signatureFields || null;
              }
            } else {
              signatureFields = metadata.approvals?.signatureFields || null;
            }
            
            // Add signature alerts for missing signatures
            if (signatureFields && Array.isArray(signatureFields)) {
              for (const field of signatureFields) {
                if (!field.isSigned) {
                  result.alerts.push({
                    id: `sig-missing-${page.pageNumber}-${field.fieldLabel}`,
                    category: "missing_value",
                    severity: "high",
                    title: "Missing Signature",
                    message: `Signature field "${field.fieldLabel}" is empty on Page ${page.pageNumber}`,
                    details: `Field: ${field.fieldLabel}`,
                    source: {
                      pageNumber: page.pageNumber,
                      sectionType: page.classification || "unknown",
                      fieldLabel: field.fieldLabel,
                      boundingBox: { x: 0, y: 0, width: 0, height: 0 },
                      surroundingContext: "",
                    },
                    relatedValues: [],
                    suggestedAction: "Obtain signature for this field",
                    ruleId: "signature_required",
                    formulaId: null,
                    isResolved: false,
                    resolvedBy: null,
                    resolvedAt: null,
                    resolution: null,
                  });
                }
              }
              
              // Count signature fields
              const missingSignatures = signatureFields.filter((f: any) => !f.isSigned);
              const signedFields = signatureFields.filter((f: any) => f.isSigned);
              
              categories.signatures.total += signatureFields.length;
              categories.signatures.passed += signedFields.length;
              categories.signatures.failed += missingSignatures.length;
              
              if (missingSignatures.length > 0) docHasIssues = true;
            }
            
            return result;
          })
        );
        
        // Run document-level validation (batch numbers, date bounds, etc)
        const batchDateBounds = validationEngine.extractBatchDateBounds(pageResults);
        const batchDateAlerts = validationEngine.validateDatesAgainstBatchWindow(pageResults, batchDateBounds);
        const extractionAlerts = validationEngine.generateBatchDateExtractionAlerts(batchDateBounds);
        const summary = await validationEngine.validateDocument(doc.id, pageResults);
        
        // Document-level alerts from cross-page checks
        const documentLevelAlerts = [
          ...summary.crossPageIssues,
          ...batchDateAlerts,
          ...extractionAlerts
        ];
        
        // Process page-level alerts for per-page counting
        for (const pageResult of pageResults) {
          const page = pages.find(p => p.pageNumber === pageResult.pageNumber);
          const metadata = page?.metadata as Record<string, any> || {};
          
          // Data integrity: check visual anomalies per page
          let hasDataIntegrityIssue = false;
          for (const alert of pageResult.alerts) {
            if (alert.category === "data_integrity") {
              hasDataIntegrityIssue = true;
            }
          }
          categories.dataIntegrity.total++;
          if (hasDataIntegrityIssue) {
            categories.dataIntegrity.failed++;
            docHasIssues = true;
          } else {
            categories.dataIntegrity.passed++;
          }
          
          // Calculations: count each calculation_error alert
          for (const alert of pageResult.alerts) {
            if (alert.category === "calculation_error") {
              categories.calculations.total++;
              categories.calculations.failed++;
              docHasIssues = true;
              totalAlerts++;
            }
          }
          
          // Date checks: count pages that have date data
          const hasDateData = pageResult.extractedValues?.some((v: any) => 
            v.valueType === 'date' || v.valueType === 'datetime'
          );
          if (hasDateData) {
            let hasDateIssue = false;
            for (const alert of pageResult.alerts) {
              if (alert.category === "sequence_error") {
                hasDateIssue = true;
              }
            }
            categories.dates.total++;
            if (hasDateIssue) {
              categories.dates.failed++;
              docHasIssues = true;
            } else {
              categories.dates.passed++;
            }
          }
          
          // Batch checks: count pages that have batch/lot fields
          const hasBatchData = metadata.extraction?.formFields?.some((f: any) => 
            /batch|lot/i.test(f.fieldName || '') || /batch|lot/i.test(f.fieldValue || '')
          );
          if (hasBatchData) {
            let hasBatchIssue = false;
            for (const alert of pageResult.alerts) {
              if (alert.category === "missing_value" && 
                  (alert.title?.toLowerCase().includes("batch") || 
                   alert.title?.toLowerCase().includes("lot"))) {
                hasBatchIssue = true;
              }
            }
            categories.batchNumbers.total++;
            if (hasBatchIssue) {
              categories.batchNumbers.failed++;
              docHasIssues = true;
            } else {
              categories.batchNumbers.passed++;
            }
          }
          
          // Page completeness issues
          for (const alert of pageResult.alerts) {
            if (alert.category === "consistency_error" || 
                (alert.category === "missing_value" && alert.title?.includes("Page"))) {
              docHasPageCompletenessIssue = true;
            }
          }
          
          // Count other alerts
          for (const alert of pageResult.alerts) {
            if (alert.category !== "calculation_error") {
              totalAlerts++;
            }
          }
        }
        
        // Process document-level alerts (cross-page batch/lot/date issues)
        for (const alert of documentLevelAlerts) {
          totalAlerts++;
          docHasIssues = true;
          
          // Document-level batch alerts (from checkBatchNumberConsistency, extractBatchDateBounds)
          if (alert.category === "missing_value" && 
              (alert.title?.toLowerCase().includes("batch") || 
               alert.title?.toLowerCase().includes("lot") ||
               alert.title?.toLowerCase().includes("commencement") ||
               alert.title?.toLowerCase().includes("completion"))) {
            // Add a check for this document-level issue
            categories.batchNumbers.total++;
            categories.batchNumbers.failed++;
          }
          
          // Document-level date sequence errors
          if (alert.category === "sequence_error") {
            categories.dates.total++;
            categories.dates.failed++;
          }
          
          // Document-level consistency errors (page completeness)
          if (alert.category === "consistency_error" || 
              (alert.category === "missing_value" && alert.title?.includes("Page"))) {
            docHasPageCompletenessIssue = true;
          }
        }
        
        // Page completeness: 1 check per document
        categories.pageCompleteness.total++;
        if (docHasPageCompletenessIssue) {
          categories.pageCompleteness.failed++;
        } else {
          categories.pageCompleteness.passed++;
        }
        
        if (docHasIssues) documentsWithIssues++;
      }
      
      // Calculate overall pass rate
      const totalChecks = Object.values(categories).reduce((sum, cat) => sum + cat.total, 0);
      const totalPassed = Object.values(categories).reduce((sum, cat) => sum + cat.passed, 0);
      const passRate = totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : 100;
      
      // Determine overall status
      const criticalIssues = categories.signatures.failed + categories.dataIntegrity.failed + categories.batchNumbers.failed;
      const overallStatus = criticalIssues === 0 ? "compliant" : criticalIssues < 5 ? "review_required" : "non_compliant";
      
      res.json({
        overview: {
          totalDocuments: completedDocs.length,
          documentsWithIssues,
          totalPages,
          totalAlerts,
          passRate,
          overallStatus,
        },
        categories,
        recentDocuments: completedDocs.slice(0, 5).map(doc => ({
          id: doc.id,
          filename: doc.filename,
          uploadedAt: doc.uploadedAt,
          totalPages: doc.totalPages,
          status: doc.status,
        })),
      });
    } catch (error: any) {
      console.error("Dashboard summary error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get document by ID
  app.get("/api/documents/:id", async (req, res) => {
    try {
      const doc = await storage.getDocument(req.params.id);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(doc);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get document summary
  app.get("/api/documents/:id/summary", async (req, res) => {
    try {
      const summary = await storage.getDocumentSummary(req.params.id);
      if (!summary) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get per-document validation summary (same format as global dashboard)
  // Uses same validation logic as /api/documents/:id/validation for consistency
  app.get("/api/documents/:id/validation-summary", async (req, res) => {
    try {
      const doc = await storage.getDocument(req.params.id);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      const pages = await storage.getPagesByDocument(req.params.id);
      
      // Initialize category metrics
      const categories = {
        signatures: { passed: 0, failed: 0, total: 0 },
        dataIntegrity: { passed: 0, failed: 0, total: 0 },
        calculations: { passed: 0, failed: 0, total: 0 },
        dates: { passed: 0, failed: 0, total: 0 },
        batchNumbers: { passed: 0, failed: 0, total: 0 },
        pageCompleteness: { passed: 0, failed: 0, total: 0 },
      };
      
      // Run validation on all pages (same as validation endpoint)
      const pageResults = await Promise.all(
        pages.map(async (page) => {
          const result = await validationEngine.validatePage(
            page.pageNumber,
            page.metadata || {},
            page.classification,
            page.extractedText || ""
          );
          
          const metadata = page.metadata as Record<string, any> || {};
          
          // Add visual anomaly alerts
          if (metadata.visualAnomalies && Array.isArray(metadata.visualAnomalies) && metadata.visualAnomalies.length > 0) {
            const visualAlerts = validationEngine.createVisualAnomalyAlerts(metadata.visualAnomalies);
            result.alerts.push(...visualAlerts);
          }
          
          // Run signature analysis
          let signatureFields: any[] | null = null;
          if (metadata.extraction) {
            try {
              const approvalAnalysis = signatureAnalyzer.analyze({
                tables: metadata.extraction.tables,
                handwrittenRegions: metadata.extraction.handwrittenRegions,
                signatures: metadata.extraction.signatures,
                formFields: metadata.extraction.formFields,
                textBlocks: metadata.extraction.textBlocks || metadata.layoutAnalysis?.textBlocks,
              });
              signatureFields = approvalAnalysis.signatureFields;
            } catch (err) {
              console.error(`Signature analysis failed for page ${page.pageNumber}:`, err);
              signatureFields = metadata.approvals?.signatureFields || null;
            }
          } else {
            signatureFields = metadata.approvals?.signatureFields || null;
          }
          
          // Count signature fields
          if (signatureFields && Array.isArray(signatureFields)) {
            const missingSignatures = signatureFields.filter((f: any) => !f.isSigned);
            const signedFields = signatureFields.filter((f: any) => f.isSigned);
            
            categories.signatures.total += signatureFields.length;
            categories.signatures.passed += signedFields.length;
            categories.signatures.failed += missingSignatures.length;
          }
          
          return result;
        })
      );
      
      // Run document-level validation (batch numbers, date bounds, etc)
      const batchDateBounds = validationEngine.extractBatchDateBounds(pageResults);
      const batchDateAlerts = validationEngine.validateDatesAgainstBatchWindow(pageResults, batchDateBounds);
      const extractionAlerts = validationEngine.generateBatchDateExtractionAlerts(batchDateBounds);
      const summary = await validationEngine.validateDocument(req.params.id, pageResults);
      
      // Document-level alerts from cross-page checks
      const documentLevelAlerts = [
        ...summary.crossPageIssues,
        ...batchDateAlerts,
        ...extractionAlerts
      ];
      
      let totalAlerts = 0;
      let hasPageCompletenessIssue = false;
      
      // Process page-level alerts for per-page counting
      for (const pageResult of pageResults) {
        const page = pages.find(p => p.pageNumber === pageResult.pageNumber);
        const metadata = page?.metadata as Record<string, any> || {};
        
        // Data integrity: check visual anomalies per page
        let hasDataIntegrityIssue = false;
        for (const alert of pageResult.alerts) {
          if (alert.category === "data_integrity") {
            hasDataIntegrityIssue = true;
          }
        }
        categories.dataIntegrity.total++;
        if (hasDataIntegrityIssue) {
          categories.dataIntegrity.failed++;
        } else {
          categories.dataIntegrity.passed++;
        }
        
        // Calculations: count each calculation_error alert
        for (const alert of pageResult.alerts) {
          if (alert.category === "calculation_error") {
            categories.calculations.total++;
            categories.calculations.failed++;
            totalAlerts++;
          }
        }
        
        // Date checks: count pages that have date data
        const hasDateData = pageResult.extractedValues?.some((v: any) => 
          v.valueType === 'date' || v.valueType === 'datetime'
        );
        if (hasDateData) {
          let hasDateIssue = false;
          for (const alert of pageResult.alerts) {
            if (alert.category === "sequence_error") {
              hasDateIssue = true;
            }
          }
          categories.dates.total++;
          if (hasDateIssue) {
            categories.dates.failed++;
          } else {
            categories.dates.passed++;
          }
        }
        
        // Batch checks: count pages that have batch/lot fields
        const hasBatchData = metadata.extraction?.formFields?.some((f: any) => 
          /batch|lot/i.test(f.fieldName || '') || /batch|lot/i.test(f.fieldValue || '')
        );
        if (hasBatchData) {
          let hasBatchIssue = false;
          for (const alert of pageResult.alerts) {
            if (alert.category === "missing_value" && 
                (alert.title?.toLowerCase().includes("batch") || 
                 alert.title?.toLowerCase().includes("lot"))) {
              hasBatchIssue = true;
            }
          }
          categories.batchNumbers.total++;
          if (hasBatchIssue) {
            categories.batchNumbers.failed++;
          } else {
            categories.batchNumbers.passed++;
          }
        }
        
        // Page completeness issues
        for (const alert of pageResult.alerts) {
          if (alert.category === "consistency_error" || 
              (alert.category === "missing_value" && alert.title?.includes("Page"))) {
            hasPageCompletenessIssue = true;
          }
        }
        
        // Count other alerts
        for (const alert of pageResult.alerts) {
          if (alert.category !== "calculation_error") {
            totalAlerts++;
          }
        }
      }
      
      // Process document-level alerts (cross-page batch/lot/date issues)
      for (const alert of documentLevelAlerts) {
        totalAlerts++;
        
        // Document-level batch alerts (from checkBatchNumberConsistency, extractBatchDateBounds)
        if (alert.category === "missing_value" && 
            (alert.title?.toLowerCase().includes("batch") || 
             alert.title?.toLowerCase().includes("lot") ||
             alert.title?.toLowerCase().includes("commencement") ||
             alert.title?.toLowerCase().includes("completion"))) {
          // Add a check for this document-level issue
          categories.batchNumbers.total++;
          categories.batchNumbers.failed++;
        }
        
        // Document-level date sequence errors
        if (alert.category === "sequence_error") {
          categories.dates.total++;
          categories.dates.failed++;
        }
        
        // Document-level consistency errors (page completeness)
        if (alert.category === "consistency_error" || 
            (alert.category === "missing_value" && alert.title?.includes("Page"))) {
          hasPageCompletenessIssue = true;
        }
      }
      
      // Page completeness: 1 check per document
      categories.pageCompleteness.total = 1;
      if (hasPageCompletenessIssue) {
        categories.pageCompleteness.failed = 1;
        categories.pageCompleteness.passed = 0;
      } else {
        categories.pageCompleteness.passed = 1;
        categories.pageCompleteness.failed = 0;
      }
      
      // Calculate overall pass rate
      const totalChecks = Object.values(categories).reduce((sum, cat) => sum + cat.total, 0);
      const totalPassed = Object.values(categories).reduce((sum, cat) => sum + cat.passed, 0);
      const passRate = totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : 100;
      
      // Determine overall status
      const criticalIssues = categories.signatures.failed + categories.dataIntegrity.failed + categories.batchNumbers.failed;
      const overallStatus = criticalIssues === 0 ? "compliant" : criticalIssues < 5 ? "review_required" : "non_compliant";
      
      res.json({
        overview: {
          totalPages: pages.length,
          totalAlerts,
          passRate,
          overallStatus,
        },
        categories,
      });
    } catch (error: any) {
      console.error("Document validation summary error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get pages for document
  app.get("/api/documents/:id/pages", async (req, res) => {
    try {
      const pages = await storage.getPagesByDocument(req.params.id);
      res.json(pages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get quality issues for document
  app.get("/api/documents/:id/issues", async (req, res) => {
    try {
      const issues = await storage.getIssuesByDocument(req.params.id);
      res.json(issues);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Export document data
  app.get("/api/documents/:id/export", async (req, res) => {
    try {
      const summary = await storage.getDocumentSummary(req.params.id);
      if (!summary) {
        return res.status(404).json({ error: "Document not found" });
      }

      const pages = await storage.getPagesByDocument(req.params.id);
      const issues = await storage.getIssuesByDocument(req.params.id);

      const exportData = {
        document: summary.document,
        statistics: {
          totalPages: summary.pageCount,
          classificationBreakdown: summary.classificationBreakdown,
          averageConfidence: summary.avgConfidence,
          issuesFound: summary.issueCount,
        },
        pages: pages.map(page => ({
          pageNumber: page.pageNumber,
          classification: page.classification,
          confidence: page.confidence,
          extractedText: page.extractedText,
          issues: page.issues,
          metadata: page.metadata,
        })),
        qualityIssues: issues.map(issue => ({
          type: issue.issueType,
          severity: issue.severity,
          description: issue.description,
          pageNumbers: issue.pageNumbers,
        })),
      };

      const filename = summary.document.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}-export.json"`
      );
      res.json(exportData);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Validate page approvals
  app.get("/api/documents/:docId/pages/:pageNumber/validate-approvals", async (req, res) => {
    try {
      const { docId, pageNumber } = req.params;
      
      // Get the page
      const pages = await storage.getPagesByDocument(docId);
      const page = pages.find(p => p.pageNumber === parseInt(pageNumber));
      
      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }

      const approvals = page.metadata?.approvals;
      
      if (!approvals) {
        return res.json({
          valid: false,
          errors: ["No approval data found on this page"],
          warnings: [],
        });
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      // Check for missing required signatures
      if (approvals.missingSignatures && approvals.missingSignatures.length > 0) {
        errors.push(`Missing required signatures: ${approvals.missingSignatures.map((r: string) => r.replace(/_/g, ' ')).join(', ')}`);
      }

      // Check signature sequence
      if (!approvals.sequenceValid) {
        errors.push("Approval sequence is not in the correct order");
      }

      // Check for dates
      if (!approvals.allDatesPresent) {
        warnings.push("Some signatures are missing associated dates");
      }

      // Check checkbox completion
      if (!approvals.allCheckboxesChecked) {
        warnings.push("Not all approval checkboxes are checked");
      }

      // Check individual checkpoints
      const incompleteCheckpoints = (approvals.checkpoints || []).filter((cp: any) => !cp.isComplete);
      if (incompleteCheckpoints.length > 0) {
        errors.push(`${incompleteCheckpoints.length} incomplete approval checkpoint(s)`);
      }

      res.json({
        valid: errors.length === 0,
        errors,
        warnings,
        summary: {
          totalSignatures: approvals.signatures?.length || 0,
          missingSignatures: approvals.missingSignatures?.length || 0,
          sequenceValid: approvals.sequenceValid,
          allDatesPresent: approvals.allDatesPresent,
          allCheckboxesChecked: approvals.allCheckboxesChecked,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get validation results for a document
  app.get("/api/documents/:id/validation", async (req, res) => {
    try {
      const doc = await storage.getDocument(req.params.id);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }

      const pages = await storage.getPagesByDocument(req.params.id);
      
      // Run validation on all pages
      const pageResults = await Promise.all(
        pages.map(async (page) => {
          const result = await validationEngine.validatePage(
            page.pageNumber,
            page.metadata || {},
            page.classification,
            page.extractedText || ""
          );
          
          // Add visual anomaly alerts from page metadata
          const metadata = page.metadata as Record<string, any> || {};
          if (metadata.visualAnomalies && Array.isArray(metadata.visualAnomalies) && metadata.visualAnomalies.length > 0) {
            const visualAlerts = validationEngine.createVisualAnomalyAlerts(metadata.visualAnomalies);
            result.alerts.push(...visualAlerts);
          }
          
          // Run signature analysis on-the-fly with latest detection logic
          // Always re-run to use updated abbreviation table detection
          let signatureFields: any[] | null = null;
          
          if (metadata.extraction) {
            try {
              const approvalAnalysis = signatureAnalyzer.analyze({
                tables: metadata.extraction.tables,
                handwrittenRegions: metadata.extraction.handwrittenRegions,
                signatures: metadata.extraction.signatures,
                formFields: metadata.extraction.formFields,
                textBlocks: metadata.extraction.textBlocks || metadata.layoutAnalysis?.textBlocks,
              });
              signatureFields = approvalAnalysis.signatureFields;
            } catch (err) {
              console.error(`Signature analysis failed for page ${page.pageNumber}:`, err);
              // Fall back to stored signatureFields if analysis fails
              signatureFields = metadata.approvals?.signatureFields || null;
            }
          } else {
            // Use stored signatureFields if no extraction data available
            signatureFields = metadata.approvals?.signatureFields || null;
          }
          
          // Add signature alerts for missing signatures
          if (signatureFields && Array.isArray(signatureFields)) {
            for (const field of signatureFields) {
              if (!field.isSigned) {
                result.alerts.push({
                  id: `sig-missing-${page.pageNumber}-${field.fieldLabel}`,
                  category: "missing_value",
                  severity: "high",
                  title: "Missing Signature",
                  message: `Signature field "${field.fieldLabel}" is empty on Page ${page.pageNumber}`,
                  details: `Field: ${field.fieldLabel}${field.rowIndex !== undefined ? `, Row: ${field.rowIndex}` : ''}`,
                  source: {
                    pageNumber: page.pageNumber,
                    sectionType: page.classification || "unknown",
                    fieldLabel: field.fieldLabel,
                    boundingBox: field.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
                    surroundingContext: "",
                  },
                  relatedValues: [],
                  suggestedAction: "Obtain signature for this field",
                  ruleId: "signature_required",
                  formulaId: null,
                  isResolved: false,
                  resolvedBy: null,
                  resolvedAt: null,
                  resolution: null,
                });
              }
            }
            
            // Attach signatureFields to result metadata for UI consumption
            if (!(result as any).metadata) {
              (result as any).metadata = {};
            }
            if (!(result as any).metadata.approvals) {
              (result as any).metadata.approvals = {};
            }
            (result as any).metadata.approvals.signatureFields = signatureFields;
          }
          
          return result;
        })
      );

      // Extract batch commencement/completion dates for temporal validation
      const batchDateBounds = validationEngine.extractBatchDateBounds(pageResults);
      
      // Validate all dates against batch window
      const batchDateAlerts = validationEngine.validateDatesAgainstBatchWindow(pageResults, batchDateBounds);
      
      // Generate alerts for batch date extraction issues
      const extractionAlerts = validationEngine.generateBatchDateExtractionAlerts(batchDateBounds);

      // Get document-level summary
      const summary = await validationEngine.validateDocument(req.params.id, pageResults);
      
      // Add batch date alerts to cross-page issues
      summary.crossPageIssues = [
        ...summary.crossPageIssues,
        ...batchDateAlerts,
        ...extractionAlerts
      ];
      summary.totalAlerts += batchDateAlerts.length + extractionAlerts.length;

      // Update alert counts
      for (const alert of [...batchDateAlerts, ...extractionAlerts]) {
        summary.alertsBySeverity[alert.severity]++;
        summary.alertsByCategory[alert.category]++;
      }

      // Store batch date bounds in document for reference
      if (batchDateBounds.commencementDate || batchDateBounds.completionDate) {
        await storage.updateDocument(req.params.id, { batchDateBounds });
      }

      res.json({
        summary,
        pageResults,
        batchDateBounds,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get validation alerts for a specific page
  app.get("/api/documents/:docId/pages/:pageNumber/validation", async (req, res) => {
    try {
      const { docId, pageNumber } = req.params;
      
      const doc = await storage.getDocument(docId);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }

      const pages = await storage.getPagesByDocument(docId);
      const page = pages.find(p => p.pageNumber === parseInt(pageNumber));
      
      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }

      const result = await validationEngine.validatePage(
        page.pageNumber,
        page.metadata || {},
        page.classification,
        page.extractedText || ""
      );

      // Add visual anomaly alerts from page metadata
      const metadata = page.metadata as Record<string, any> || {};
      if (metadata.visualAnomalies && Array.isArray(metadata.visualAnomalies) && metadata.visualAnomalies.length > 0) {
        const visualAlerts = validationEngine.createVisualAnomalyAlerts(metadata.visualAnomalies);
        result.alerts.push(...visualAlerts);
      }
      
      // Run signature analysis on-the-fly with latest detection logic
      // Always re-run to use updated abbreviation table detection
      let signatureFields: any[] | null = null;
      
      if (metadata.extraction) {
        try {
          const approvalAnalysis = signatureAnalyzer.analyze({
            tables: metadata.extraction.tables,
            handwrittenRegions: metadata.extraction.handwrittenRegions,
            signatures: metadata.extraction.signatures,
            formFields: metadata.extraction.formFields,
            textBlocks: metadata.extraction.textBlocks || metadata.layoutAnalysis?.textBlocks,
          });
          signatureFields = approvalAnalysis.signatureFields;
        } catch (err) {
          console.error(`Signature analysis failed for page ${page.pageNumber}:`, err);
          // Fall back to stored signatureFields if analysis fails
          signatureFields = metadata.approvals?.signatureFields || null;
        }
      } else {
        // Use stored signatureFields if no extraction data available
        signatureFields = metadata.approvals?.signatureFields || null;
      }
      
      // Add signature alerts for missing signatures
      if (signatureFields && Array.isArray(signatureFields)) {
        for (const field of signatureFields) {
          if (!field.isSigned) {
            result.alerts.push({
              id: `sig-missing-${page.pageNumber}-${field.fieldLabel}`,
              category: "missing_value",
              severity: "high",
              title: "Missing Signature",
              message: `Signature field "${field.fieldLabel}" is empty on Page ${page.pageNumber}`,
              details: `Field: ${field.fieldLabel}${field.rowIndex !== undefined ? `, Row: ${field.rowIndex}` : ''}`,
              source: {
                pageNumber: page.pageNumber,
                sectionType: page.classification || "unknown",
                fieldLabel: field.fieldLabel,
                boundingBox: field.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
                surroundingContext: "",
              },
              relatedValues: [],
              suggestedAction: "Obtain signature for this field",
              ruleId: "signature_required",
              formulaId: null,
              isResolved: false,
              resolvedBy: null,
              resolvedAt: null,
              resolution: null,
            });
          }
        }
        
        // Attach signatureFields to result metadata for UI consumption
        if (!(result as any).metadata) {
          (result as any).metadata = {};
        }
        if (!(result as any).metadata.approvals) {
          (result as any).metadata.approvals = {};
        }
        (result as any).metadata.approvals.signatureFields = signatureFields;
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get SOP rules
  app.get("/api/validation/rules", async (_req, res) => {
    try {
      const rules = validationEngine.getSOPRules();
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update SOP rule
  app.patch("/api/validation/rules/:ruleId", async (req, res) => {
    try {
      const { ruleId } = req.params;
      const updates = req.body;
      
      const success = validationEngine.updateSOPRule(ruleId, updates);
      if (!success) {
        return res.status(404).json({ error: "Rule not found" });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Approve or unapprove document (requires authentication)
  app.patch("/api/documents/:id/approve", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || null;
      const documentId = req.params.id;
      const { isApproved } = req.body;
      
      if (typeof isApproved !== "boolean") {
        return res.status(400).json({ error: "isApproved must be a boolean" });
      }
      
      const doc = await storage.getDocument(documentId);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Update document approval status
      const updates: any = {
        isApproved,
        approvedBy: isApproved ? userId : null,
        approvedAt: isApproved ? new Date() : null,
      };
      
      const updated = await storage.updateDocument(documentId, updates);
      
      // Log approval event
      await logEvent(isApproved ? "document_approved" : "document_unapproved", "success", {
        documentId,
        userId,
        metadata: {
          filename: doc.filename,
          previousApprovalStatus: doc.isApproved,
          newApprovalStatus: isApproved,
        },
      });
      
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete document (requires authentication)
  app.delete("/api/documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || null;
      const documentId = req.params.id;
      
      // Get document info before deletion for audit log
      const doc = await storage.getDocument(documentId);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Log deletion event BEFORE deleting so we preserve documentId for audit trail
      await logEvent("document_delete", "success", {
        documentId,
        userId,
        metadata: {
          filename: doc.filename,
          fileSize: doc.fileSize,
          totalPages: doc.totalPages,
          status: doc.status,
        },
      });
      
      const deleted = await storage.deleteDocument(documentId);
      if (!deleted) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Serve page images with placeholder fallback
  app.get("/api/documents/:docId/pages/:pageNumber/image", async (req, res) => {
    try {
      const { docId, pageNumber } = req.params;
      const fs = await import('fs');
      
      // Validate document exists
      const doc = await storage.getDocument(docId);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Get page scoped to this document
      const pages = await storage.getPagesByDocument(docId);
      const page = pages.find(p => p.pageNumber === parseInt(pageNumber));
      
      if (!page || !page.imagePath) {
        // Return placeholder SVG for missing image path
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('X-Image-Status', 'missing-path');
        return res.send(generatePlaceholderSVG(parseInt(pageNumber), 'Image path not found'));
      }

      // Sanitize and validate image path to prevent directory traversal
      const uploadsDir = path.join(process.cwd(), "uploads");
      const requestedPath = path.join(uploadsDir, page.imagePath);
      const normalizedPath = path.normalize(requestedPath);
      
      // Ensure the resolved path is within uploads directory using relative path check
      const relativePath = path.relative(uploadsDir, normalizedPath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        console.error("Directory traversal attempt detected:", { 
          imagePath: page.imagePath, 
          relativePath,
          documentId: docId 
        });
        return res.status(403).json({ error: "Invalid image path" });
      }

      // Check if file actually exists, return placeholder if not
      if (!fs.existsSync(normalizedPath)) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('X-Image-Status', 'file-missing');
        return res.send(generatePlaceholderSVG(parseInt(pageNumber), 'Image file not available'));
      }

      res.sendFile(normalizedPath);
    } catch (error: any) {
      console.error("Error serving page image:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Serve visual anomaly thumbnails
  app.get("/api/thumbnails/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      
      // Validate filename to prevent directory traversal
      if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: "Invalid filename" });
      }

      const thumbnailsDir = path.join(process.cwd(), "uploads", "thumbnails");
      const thumbnailPath = path.join(thumbnailsDir, filename);
      const normalizedPath = path.normalize(thumbnailPath);
      
      // Ensure the resolved path is within thumbnails directory
      const relativePath = path.relative(thumbnailsDir, normalizedPath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        console.error("Thumbnail directory traversal attempt detected:", { filename });
        return res.status(403).json({ error: "Invalid thumbnail path" });
      }

      // Check if file exists
      const fs = await import('fs');
      if (!fs.existsSync(normalizedPath)) {
        return res.status(404).json({ error: "Thumbnail not found" });
      }

      res.sendFile(normalizedPath);
    } catch (error: any) {
      console.error("Error serving thumbnail:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Process document function with audit logging
  async function processDocument(documentId: string, pdfBuffer: Buffer, userId?: string | null) {
    try {
      await storage.updateDocument(documentId, { status: "processing" });

      // Get page count - fallback to demo if PDF parsing fails
      let pageCount = 10; // Default for demo mode
      try {
        pageCount = await pdfProcessor.getPageCount(pdfBuffer);
      } catch (pdfError: any) {
        console.warn("PDF parsing failed, using default page count for demo:", pdfError.message);
      }
      await storage.updateDocument(documentId, { totalPages: pageCount });

      // Extract page images for side-by-side viewing
      let pageImages: string[] = [];
      try {
        console.log(`Extracting images for ${pageCount} pages...`);
        pageImages = await pdfProcessor.extractPageImages(pdfBuffer, documentId);
        console.log(`Successfully extracted ${pageImages.length} page images`);
        
        // Log successful image conversion
        await logEvent("image_conversion", "success", {
          documentId,
          userId,
          metadata: {
            pagesExtracted: pageImages.length,
            totalPages: pageCount,
          },
        });
      } catch (imageError: any) {
        console.warn("Failed to extract page images:", imageError.message);
        
        // Log image conversion failure
        await logEvent("image_conversion", "failed", {
          documentId,
          userId,
          errorMessage: imageError.message,
          metadata: { totalPages: pageCount },
        });
        // Continue without images - they're not critical for processing
      }

      const processedPages: Array<{ pageNumber: number; text: string; classification: any }> = [];
      let usedFallback = false;
      let fallbackReason = "";
      let pagesAlreadyProcessed = 0;

      // Process with Document AI if available
      if (documentAI) {
        try {
          // Split into batches if document is large (>15 pages)
          // Form Parser sync API limit is 15 pages per request
          const MAX_PAGES_PER_BATCH = 15;
          
          if (pageCount > MAX_PAGES_PER_BATCH) {
            console.log(`Large document detected (${pageCount} pages). Splitting into batches of ${MAX_PAGES_PER_BATCH} pages...`);
            const batches = await pdfProcessor.splitIntoBatches(pdfBuffer, MAX_PAGES_PER_BATCH);
            console.log(`Created ${batches.length} batches for processing`);

            // Process each batch
            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
              const batch = batches[batchIndex];
              console.log(`Processing batch ${batchIndex + 1}/${batches.length}: pages ${batch.startPage}-${batch.endPage}`);

              // Log Document AI extraction start
              await logEvent("document_ai_extraction", "pending", {
                documentId,
                userId,
                metadata: { 
                  batchIndex: batchIndex + 1, 
                  totalBatches: batches.length,
                  startPage: batch.startPage,
                  endPage: batch.endPage,
                },
              });

              const batchDocument = await documentAI.processDocument(batch.buffer);
              
              // Log Document AI extraction success
              await logEvent("document_ai_extraction", "success", {
                documentId,
                userId,
                metadata: { 
                  batchIndex: batchIndex + 1, 
                  pagesExtracted: documentAI.getTotalPages(batchDocument),
                },
              });
              const batchPages = documentAI.getTotalPages(batchDocument);

              for (let i = 0; i < batchPages; i++) {
                const actualPageNumber = batch.startPage + i;
                
                // Extract comprehensive page data
                const pageData = documentAI.extractPageData(batchDocument, i);
                const extractedText = pageData?.extractedText || "";

                // Classify page
                const classification = await classifier.classifyPage(extractedText, actualPageNumber);

                // Perform layout analysis to structure the extracted data
                let layoutAnalysis = null;
                if (pageData) {
                  layoutAnalysis = layoutAnalyzer.analyze({
                    tables: pageData.tables,
                    formFields: pageData.formFields,
                    checkboxes: pageData.checkboxes,
                    handwrittenRegions: pageData.handwrittenRegions,
                    signatures: pageData.signatures,
                    textBlocks: pageData.textBlocks,
                    pageDimensions: pageData.pageDimensions,
                  });
                }

                // Perform signature and approval analysis with error handling
                let approvalAnalysis = null;
                if (pageData) {
                  try {
                    approvalAnalysis = signatureAnalyzer.analyze({
                      handwrittenRegions: pageData.handwrittenRegions,
                      signatures: pageData.signatures,
                      checkboxes: pageData.checkboxes,
                      formFields: pageData.formFields,
                      textBlocks: pageData.textBlocks,
                      tables: pageData.tables,
                      pageDimensions: pageData.pageDimensions,
                    });
                  } catch (approvalError: any) {
                    console.error(`Approval analysis failed for page ${actualPageNumber}:`, approvalError.message);
                    // Provide default empty approvals on error
                    approvalAnalysis = {
                      signatures: [],
                      checkpoints: [],
                      approvalChain: [],
                      missingSignatures: [],
                      sequenceValid: true,
                      allDatesPresent: true,
                      allCheckboxesChecked: true,
                    };
                  }
                }

                // Perform visual anomaly detection (strike-offs, red marks, corrections)
                let visualAnalysis = null;
                const pageImagePath = pageImages[actualPageNumber - 1];
                if (pageImagePath && pageData) {
                  try {
                    const fullImagePath = path.join(process.cwd(), 'uploads', pageImagePath);
                    const textRegions = visualAnalyzer.extractTextRegionsFromOCR(pageData);
                    visualAnalysis = await visualAnalyzer.analyzePageImage(
                      fullImagePath,
                      actualPageNumber,
                      textRegions,
                      documentId
                    );
                    if (visualAnalysis.anomalies.length > 0) {
                      console.log(`Visual anomalies detected on page ${actualPageNumber}: ${visualAnalysis.anomalies.length}`);
                    }
                  } catch (visualError: any) {
                    console.error(`Visual analysis failed for page ${actualPageNumber}:`, visualError.message);
                  }
                }

                // Store page with all rich extraction data, layout analysis, approvals, and visual analysis
                await storage.createPage({
                  documentId,
                  pageNumber: actualPageNumber,
                  classification: classification.classification,
                  confidence: classification.confidence,
                  extractedText,
                  imagePath: pageImages[actualPageNumber - 1], // Associate image with page
                  issues: [],
                  metadata: { 
                    reasoning: classification.reasoning,
                    batch: batchIndex + 1,
                    totalBatches: batches.length,
                    // Store all rich extraction data
                    extraction: pageData ? {
                      tables: pageData.tables,
                      formFields: pageData.formFields,
                      checkboxes: pageData.checkboxes,
                      handwrittenRegions: pageData.handwrittenRegions,
                      signatures: pageData.signatures,
                      textBlocks: pageData.textBlocks,
                      pageDimensions: pageData.pageDimensions,
                    } : null,
                    // Store structured layout analysis
                    layout: layoutAnalysis,
                    // Store signature and approval analysis
                    approvals: approvalAnalysis,
                    // Store visual anomaly detection results
                    visualAnomalies: visualAnalysis?.anomalies || [],
                  } as Record<string, any>,
                });

                processedPages.push({
                  pageNumber: actualPageNumber,
                  text: extractedText,
                  classification: classification.classification,
                });

                pagesAlreadyProcessed++;
                await storage.updateDocument(documentId, { processedPages: actualPageNumber });
              }
            }
          } else {
            // Process as single document
            // Log Document AI extraction start
            await logEvent("document_ai_extraction", "pending", {
              documentId,
              userId,
              metadata: { totalPages: pageCount },
            });

            const document = await documentAI.processDocument(pdfBuffer);
            const totalPages = documentAI.getTotalPages(document);

            // Log Document AI extraction success
            await logEvent("document_ai_extraction", "success", {
              documentId,
              userId,
              metadata: { pagesExtracted: totalPages },
            });

            for (let i = 0; i < totalPages; i++) {
              const pageNumber = i + 1;
              
              // Extract comprehensive page data
              const pageData = documentAI.extractPageData(document, i);
              const extractedText = pageData?.extractedText || "";

              // Classify page
              const classification = await classifier.classifyPage(extractedText, pageNumber);

              // Perform layout analysis to structure the extracted data
              let layoutAnalysis = null;
              if (pageData) {
                layoutAnalysis = layoutAnalyzer.analyze({
                  tables: pageData.tables,
                  formFields: pageData.formFields,
                  checkboxes: pageData.checkboxes,
                  handwrittenRegions: pageData.handwrittenRegions,
                  signatures: pageData.signatures,
                  textBlocks: pageData.textBlocks,
                  pageDimensions: pageData.pageDimensions,
                });
              }

              // Perform signature and approval analysis with error handling
              let approvalAnalysis = null;
              if (pageData) {
                try {
                  approvalAnalysis = signatureAnalyzer.analyze({
                    handwrittenRegions: pageData.handwrittenRegions,
                    signatures: pageData.signatures,
                    checkboxes: pageData.checkboxes,
                    formFields: pageData.formFields,
                    textBlocks: pageData.textBlocks,
                    tables: pageData.tables,
                    pageDimensions: pageData.pageDimensions,
                  });
                } catch (approvalError: any) {
                  console.error(`Approval analysis failed for page ${pageNumber}:`, approvalError.message);
                  // Provide default empty approvals on error
                  approvalAnalysis = {
                    signatures: [],
                    checkpoints: [],
                    approvalChain: [],
                    missingSignatures: [],
                    sequenceValid: true,
                    allDatesPresent: true,
                    allCheckboxesChecked: true,
                  };
                }
              }

              // Perform visual anomaly detection (strike-offs, red marks, corrections)
              let visualAnalysis = null;
              const pageImagePath = pageImages[pageNumber - 1];
              if (pageImagePath && pageData) {
                try {
                  const fullImagePath = path.join(process.cwd(), 'uploads', pageImagePath);
                  const textRegions = visualAnalyzer.extractTextRegionsFromOCR(pageData);
                  visualAnalysis = await visualAnalyzer.analyzePageImage(
                    fullImagePath,
                    pageNumber,
                    textRegions,
                    documentId
                  );
                  if (visualAnalysis.anomalies.length > 0) {
                    console.log(`Visual anomalies detected on page ${pageNumber}: ${visualAnalysis.anomalies.length}`);
                  }
                } catch (visualError: any) {
                  console.error(`Visual analysis failed for page ${pageNumber}:`, visualError.message);
                }
              }

              // Store page with all rich extraction data, layout analysis, approvals, and visual analysis
              await storage.createPage({
                documentId,
                pageNumber,
                classification: classification.classification,
                confidence: classification.confidence,
                extractedText,
                imagePath: pageImages[pageNumber - 1], // Associate image with page
                issues: [],
                metadata: { 
                  reasoning: classification.reasoning,
                  // Store all rich extraction data
                  extraction: pageData ? {
                    tables: pageData.tables,
                    formFields: pageData.formFields,
                    checkboxes: pageData.checkboxes,
                    handwrittenRegions: pageData.handwrittenRegions,
                    signatures: pageData.signatures,
                    textBlocks: pageData.textBlocks,
                    pageDimensions: pageData.pageDimensions,
                  } : null,
                  // Store structured layout analysis
                  layout: layoutAnalysis,
                  // Store signature and approval analysis
                  approvals: approvalAnalysis,
                  // Store visual anomaly detection results
                  visualAnomalies: visualAnalysis?.anomalies || [],
                } as Record<string, any>,
              });

              processedPages.push({
                pageNumber,
                text: extractedText,
                classification: classification.classification,
              });

              pagesAlreadyProcessed++;
              await storage.updateDocument(documentId, { processedPages: pageNumber });
            }
          }
        } catch (docAIError: any) {
          // Detect billing/permission errors using gRPC status codes
          const errorMessage = docAIError.message || String(docAIError);
          const errorCode = docAIError.code;
          const errorDetails = docAIError.details || [];
          
          // Check for gRPC code 7 (PERMISSION_DENIED) or billing-related errors
          const isBillingError = errorCode === 7 || 
                                errorMessage.includes("PERMISSION_DENIED") || 
                                errorMessage.includes("billing") ||
                                errorMessage.includes("BILLING_DISABLED") ||
                                (Array.isArray(errorDetails) && errorDetails.some((d: any) => d.reason === "BILLING_DISABLED"));
          
          console.warn("Document AI error, falling back to mock processing:", { errorCode, errorMessage });
          usedFallback = true;
          fallbackReason = isBillingError 
            ? "Google Cloud billing not enabled. Please enable billing in your Google Cloud project to use Document AI."
            : `Document AI error: ${errorMessage}`;
          
          // Fall through to fallback processing
        }
      }

      // Fallback: mock processing without Document AI (or if Document AI failed)
      if (!documentAI || usedFallback) {
        const reason = usedFallback ? fallbackReason : "Document AI service not configured";
        
        // Generate mock data with realistic page classifications for demo
        const mockClassifications = [
          "cover_page", "materials_log", "materials_log", "equipment_log", 
          "cip_sip_record", "filtration_step", "filling_log", "inspection_sheet",
          "reconciliation", "signature_page"
        ];

        // Only process pages that weren't already processed (in case of partial failure)
        for (let i = pagesAlreadyProcessed; i < pageCount; i++) {
          const pageNumber = i + 1;
          const mockClassification = mockClassifications[i % mockClassifications.length];
          const mockText = `[Mock Data - Demo Mode]\n\nPage ${pageNumber} - ${mockClassification.replace(/_/g, ' ').toUpperCase()}\n\nBatch Number: BATCH-2025-${String(pageNumber).padStart(4, '0')}\nDate: 2025-01-15\nOperator: J. Smith\n\n⚠️ ${reason}`;

          await storage.createPage({
            documentId,
            pageNumber,
            classification: mockClassification,
            confidence: 75,
            extractedText: mockText,
            imagePath: pageImages[pageNumber - 1], // Associate image with page
            issues: [reason],
            metadata: { 
              mock: true,
              approvals: {
                signatures: [],
                checkpoints: [],
                approvalChain: [],
                missingSignatures: [],
                sequenceValid: true,
                allDatesPresent: true,
                allCheckboxesChecked: true,
              }
            } as Record<string, any>,
          });

          processedPages.push({
            pageNumber,
            text: mockText,
            classification: mockClassification,
          });

          await storage.updateDocument(documentId, { processedPages: pageNumber });
        }

        // Update document with fallback status
        await storage.updateDocument(documentId, { 
          errorMessage: usedFallback ? `Demo Mode: ${fallbackReason}` : undefined 
        });
      }

      // Log page classification summary
      await logEvent("page_classification", "success", {
        documentId,
        userId,
        metadata: {
          totalPages: processedPages.length,
          classifications: processedPages.reduce((acc, p) => {
            acc[p.classification] = (acc[p.classification] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        },
      });

      // Detect quality issues
      const qualityIssues = await classifier.detectQualityIssues(processedPages);

      // Log validation stage
      await logEvent("validation", "success", {
        documentId,
        userId,
        metadata: {
          qualityIssuesFound: qualityIssues.length,
          issueSeverities: qualityIssues.reduce((acc, i) => {
            acc[i.severity] = (acc[i.severity] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        },
      });

      for (const issue of qualityIssues) {
        await storage.createQualityIssue({
          documentId,
          issueType: issue.type,
          severity: issue.severity,
          description: issue.description,
          pageNumbers: issue.pageNumbers,
        });
      }

      await storage.updateDocument(documentId, { status: "completed" });
      
      // Log processing complete
      await logEvent("processing_complete", "success", {
        documentId,
        userId,
        metadata: {
          totalPages: pageCount,
          pagesProcessed: processedPages.length,
          qualityIssuesFound: qualityIssues.length,
          usedFallback,
        },
      });
    } catch (error: any) {
      console.error("Processing error:", error);
      await storage.updateDocument(documentId, {
        status: "failed",
        errorMessage: error.message,
      });
      
      // Log processing failure
      await logEvent("processing_failed", "failed", {
        documentId,
        userId,
        errorMessage: error.message,
      });
      throw error;
    }
  }

  const httpServer = createServer(app);
  return httpServer;
}
