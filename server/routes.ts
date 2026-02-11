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
import { bmrVerificationService } from "./services/bmr-verification";
import { rawMaterialVerificationService } from "./services/raw-material-verification";
import { batchAllocationVerificationService } from "./services/batch-allocation-verification";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { evaluateQAChecklist, type QAChecklistInput } from "./services/qa-checklist";
import {
  convertBMRDiscrepanciesToAlerts,
  convertRawMaterialResultsToAlerts,
  convertBatchAllocationToAlerts,
} from "./services/verification-alerts-converter";
import type { ProcessingEventType, ValidationAlert, AlertSeverity, AlertCategory, UserDeclaredFields } from "@shared/schema";
import { extractBatchFieldsFromPages, compareUserDeclaredFields } from "./services/user-declared-verification";

// Use PostgreSQL database storage for persistence
const storage = new DBStorage();

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

  // Auth routes - returns user if authenticated, null if not
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

  app.get('/api/users', isAuthenticated, async (req: any, res) => {
    try {
      const requestingUser = await storage.getUser(req.user.claims.sub);
      if (!requestingUser || requestingUser.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      const allUsers = await storage.getAllUsers();
      res.json(allUsers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/api/users/:userId/role', isAuthenticated, async (req: any, res) => {
    try {
      const requestingUser = await storage.getUser(req.user.claims.sub);
      if (!requestingUser || requestingUser.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      const { role } = req.body;
      const validRoles = ['admin', 'reviewer', 'operator', 'viewer'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }
      const updated = await storage.updateUserRole(req.params.userId, role);
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get processing events for a document (audit trail)
  app.get("/api/documents/:id/events", async (req, res) => {
    try {
      const events = await storage.getEventsByDocument(req.params.id);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all recent processing events with user info
  app.get("/api/events/recent", async (req, res) => {
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
  app.get("/api/events/failed", async (req, res) => {
    try {
      const events = await storage.getFailedEvents();
      res.json(events);
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

  // Dashboard summary endpoint
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
      
      for (const doc of completedDocs) {
        const pages = await storage.getPagesByDocument(doc.id);
        totalPages += pages.length;
        
        let docHasIssues = false;
        
        for (const page of pages) {
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
            
            if (missingSignatures.length > 0) docHasIssues = true;
          }
          
          // Count alerts by category
          for (const alert of result.alerts) {
            totalAlerts++;
            docHasIssues = true;
            
            if (alert.category === "data_quality") {
              categories.dataIntegrity.total++;
              categories.dataIntegrity.failed++;
            } else if (alert.category === "range_violation" || alert.category === "unit_mismatch") {
              categories.calculations.total++;
              categories.calculations.failed++;
            } else if (alert.category === "format_error") {
              categories.dates.total++;
              categories.dates.failed++;
            } else if (alert.category === "sequence_error" || alert.category === "consistency_error") {
              categories.batchNumbers.total++;
              categories.batchNumbers.failed++;
            }
          }
        }
        
        if (docHasIssues) documentsWithIssues++;
      }
      
      res.json({
        totalDocuments: documents.length,
        completedDocuments: completedDocs.length,
        approvedDocuments: documents.filter(d => d.isApproved).length,
        documentsWithIssues,
        totalPages,
        totalAlerts,
        categories,
        recentActivity: await storage.getRecentEvents(10),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Upload and process document
  app.post("/api/documents/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({ error: "Only PDF files are supported" });
      }

      // Parse user-declared fields if provided
      let userDeclaredFields = null;
      if (req.body.userDeclaredFields) {
        try {
          userDeclaredFields = typeof req.body.userDeclaredFields === "string"
            ? JSON.parse(req.body.userDeclaredFields)
            : req.body.userDeclaredFields;
        } catch (e) {
          console.warn("Failed to parse userDeclaredFields:", e);
        }
      }

      // Create document record
      const doc = await storage.createDocument({
        filename: req.file.originalname,
        fileSize: req.file.size,
        status: "pending",
        ...(userDeclaredFields ? { userDeclaredFields } : {}),
      });

      // Log upload event
      await logEvent("document_upload", "success", {
        documentId: doc.id,
        metadata: {
          filename: req.file.originalname,
          fileSize: req.file.size,
        },
      });

      // Start processing asynchronously
      processDocument(doc.id, req.file.buffer).catch(error => {
        console.error("Error processing document:", error);
        storage.updateDocument(doc.id, {
          status: "failed",
          errorMessage: error.message,
        });
        logEvent("processing_failed", "failed", {
          documentId: doc.id,
          errorMessage: error.message,
        });
      });

      res.json(doc);
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all documents
  app.get("/api/documents", async (_req, res) => {
    try {
      const documents = await storage.getAllDocuments();
      res.json(documents);
    } catch (error: any) {
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

      // Merge stored verification alerts (from BMR/RawMaterial/BatchAllocation auto-verification)
      const storedVerificationAlerts = (doc.verificationAlerts as ValidationAlert[]) || [];
      if (storedVerificationAlerts.length > 0) {
        summary.crossPageIssues = [
          ...summary.crossPageIssues,
          ...storedVerificationAlerts,
        ];
        summary.totalAlerts += storedVerificationAlerts.length;
        for (const alert of storedVerificationAlerts) {
          const sev = alert.severity as AlertSeverity;
          const cat = alert.category as AlertCategory;
          if (sev && summary.alertsBySeverity[sev] !== undefined) {
            summary.alertsBySeverity[sev]++;
          }
          if (cat && summary.alertsByCategory[cat] !== undefined) {
            summary.alertsByCategory[cat]++;
          }
        }
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

  // Get or compute QA checklist for a document
  app.get("/api/documents/:id/qa-checklist", async (req, res) => {
    try {
      const doc = await storage.getDocument(req.params.id);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Return cached checklist if available
      if (doc.qaChecklist) {
        return res.json(doc.qaChecklist);
      }

      // Compute it on the fly
      const pages = await storage.getPagesByDocument(req.params.id);
      const pageResults = await Promise.all(
        pages.map(async (page) => {
          const result = await validationEngine.validatePage(
            page.pageNumber,
            page.metadata || {},
            page.classification,
            page.extractedText || ""
          );
          const metadata = page.metadata as Record<string, any> || {};
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
              signatureFields = metadata.approvals?.signatureFields || null;
            }
          } else {
            signatureFields = metadata.approvals?.signatureFields || null;
          }
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
          }
          return result;
        })
      );

      const batchDateBounds = validationEngine.extractBatchDateBounds(pageResults);
      const batchDateAlerts = validationEngine.validateDatesAgainstBatchWindow(pageResults, batchDateBounds);
      const extractionAlerts = validationEngine.generateBatchDateExtractionAlerts(batchDateBounds);
      const summary = await validationEngine.validateDocument(req.params.id, pageResults);
      summary.crossPageIssues = [...summary.crossPageIssues, ...batchDateAlerts, ...extractionAlerts];
      summary.totalAlerts += batchDateAlerts.length + extractionAlerts.length;
      for (const alert of [...batchDateAlerts, ...extractionAlerts]) {
        summary.alertsBySeverity[alert.severity]++;
        summary.alertsByCategory[alert.category]++;
      }

      // Include stored verification alerts from auto-verification pipeline
      const storedVerificationAlerts = (doc.verificationAlerts as ValidationAlert[]) || [];
      if (storedVerificationAlerts.length > 0) {
        summary.crossPageIssues = [...summary.crossPageIssues, ...storedVerificationAlerts];
        summary.totalAlerts += storedVerificationAlerts.length;
        for (const alert of storedVerificationAlerts) {
          const sev = alert.severity as AlertSeverity;
          const cat = alert.category as AlertCategory;
          if (sev && summary.alertsBySeverity[sev] !== undefined) {
            summary.alertsBySeverity[sev]++;
          }
          if (cat && summary.alertsByCategory[cat] !== undefined) {
            summary.alertsByCategory[cat]++;
          }
        }
      }

      const allAlerts = [
        ...pageResults.flatMap(p => p.alerts),
        ...summary.crossPageIssues,
      ];

      // Check for BMR verification (from auto-verify alerts or standalone uploads)
      const bmrVerificationAlerts = storedVerificationAlerts.filter(a => a.ruleId === "bmr_verification");
      let bmrDiscrepancyCount = bmrVerificationAlerts.filter(a => a.severity !== "info").length;
      let hasBmrVerification = bmrDiscrepancyCount > 0 || bmrVerificationAlerts.length > 0;

      if (!hasBmrVerification) {
        const bmrVerifs = await storage.getAllBMRVerifications();
        const linkedBmr = bmrVerifs.find(v => v.documentId === req.params.id);
        if (linkedBmr) {
          hasBmrVerification = true;
          const discs = await storage.getDiscrepanciesByVerification(linkedBmr.id);
          bmrDiscrepancyCount = discs.length;
        }
      }

      // Check for raw material verification (from auto-verify alerts or standalone uploads)
      const rawMatAlerts = storedVerificationAlerts.filter(a => a.ruleId === "raw_material_verification");
      let hasRawMaterialVerification = rawMatAlerts.length > 0;
      let rawMaterialOutOfLimits = rawMatAlerts.filter(a => a.category === "range_violation" && a.severity !== "info").length;

      if (!hasRawMaterialVerification) {
        const rmVerifications = await storage.getAllRawMaterialVerifications();
        const linkedRm = rmVerifications.find(v => v.documentId === req.params.id);
        if (linkedRm) {
          hasRawMaterialVerification = true;
          rawMaterialOutOfLimits = linkedRm.materialsOutOfLimits || 0;
        }
      }

      // Check for batch allocation verification (from auto-verify alerts or standalone uploads)
      const batchAllocAlerts = storedVerificationAlerts.filter(a => a.ruleId === "batch_allocation_verification");
      let hasBatchAllocation = batchAllocAlerts.length > 0;
      let batchAllocationValid = batchAllocAlerts.filter(a => a.severity !== "info").length === 0;

      if (!hasBatchAllocation) {
        const baVerifications = await storage.getAllBatchAllocationVerifications();
        const linkedBa = baVerifications.find(v => v.documentId === req.params.id);
        if (linkedBa) {
          hasBatchAllocation = true;
          batchAllocationValid = linkedBa.status === "completed";
        }
      }

      const missingSignatureCount = allAlerts.filter(a => 
        a.title.toLowerCase().includes("missing signature")
      ).length;

      const userDeclaredAlerts = allAlerts.filter(a => a.ruleId === "user_declared_verification");
      const hasUserDeclaredFields = !!(doc.userDeclaredFields);
      const userDeclaredMismatchCount = userDeclaredAlerts.length;

      const input: QAChecklistInput = {
        documentId: req.params.id,
        validationSummary: summary,
        pageResults,
        allAlerts,
        hasBmrVerification,
        bmrDiscrepancyCount,
        hasRawMaterialVerification,
        rawMaterialOutOfLimits,
        hasBatchAllocation,
        batchAllocationValid,
        totalPages: doc.totalPages || pages.length,
        hasSignatures: allAlerts.some(a => a.ruleId === "signature_required"),
        missingSignatureCount,
        hasUserDeclaredFields,
        userDeclaredMismatchCount,
      };

      const checklist = evaluateQAChecklist(input);

      // Cache it on the document
      await storage.updateDocument(req.params.id, { qaChecklist: checklist });

      res.json(checklist);
    } catch (error: any) {
      console.error("QA checklist error:", error);
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

  // Delete document
  app.delete("/api/documents/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteDocument(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Serve page images
  app.get("/api/documents/:docId/pages/:pageNumber/image", async (req, res) => {
    try {
      const { docId, pageNumber } = req.params;
      
      // Validate document exists
      const doc = await storage.getDocument(docId);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Get page scoped to this document
      const pages = await storage.getPagesByDocument(docId);
      const page = pages.find(p => p.pageNumber === parseInt(pageNumber));
      
      if (!page || !page.imagePath) {
        return res.status(404).json({ error: "Page image not found" });
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

  // Process document function
  async function processDocument(documentId: string, pdfBuffer: Buffer) {
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
      } catch (imageError: any) {
        console.warn("Failed to extract page images:", imageError.message);
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

              const batchDocument = await documentAI.processDocument(batch.buffer);
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
            const document = await documentAI.processDocument(pdfBuffer);
            const totalPages = documentAI.getTotalPages(document);

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

        // Update document with fallback status if applicable
        if (usedFallback && fallbackReason) {
          await storage.updateDocument(documentId, { 
            errorMessage: `Demo Mode: ${fallbackReason}` 
          });
        }
      }

      // Detect quality issues
      const qualityIssues = await classifier.detectQualityIssues(processedPages);

      for (const issue of qualityIssues) {
        await storage.createQualityIssue({
          documentId,
          issueType: issue.type,
          severity: issue.severity,
          description: issue.description,
          pageNumbers: issue.pageNumbers,
        });
      }

      // ==========================================
      // AUTO-VERIFICATION: Run BMR, Raw Material, and Batch Allocation checks
      // ==========================================
      let verificationAlerts: any[] = [];
      try {
        const storedPages = await storage.getPagesByDocument(documentId);
        
        const pagesWithData = storedPages.map(p => {
          const meta = p.metadata as Record<string, any> || {};
          return {
            pageNumber: p.pageNumber,
            rawText: p.extractedText || "",
            tables: meta.extraction?.tables || [],
            formFields: meta.extraction?.formFields || [],
            classification: p.classification,
          };
        });

        // 1. BMR Verification — detect MPC and BMR pages and compare
        try {
          let mpcPage: any = null;
          let bmrPage: any = null;

          for (const page of pagesWithData) {
            const docType = bmrVerificationService.identifyDocumentType(page.rawText);
            if (docType === "master_product_card" && !mpcPage) {
              mpcPage = page;
            } else if (docType === "bmr" && !bmrPage) {
              bmrPage = page;
            }
          }

          if (mpcPage && bmrPage) {
            console.log(`[AUTO-VERIFY] BMR Verification: MPC on page ${mpcPage.pageNumber}, BMR on page ${bmrPage.pageNumber}`);
            const mpcFields = bmrVerificationService.extractFieldsFromText(mpcPage.rawText);
            const bmrFields = bmrVerificationService.extractFieldsFromText(bmrPage.rawText);
            
            let result;
            if (mpcPage.formFields.length > 0 || bmrPage.formFields.length > 0) {
              const mpcFieldsWithBounds = bmrVerificationService.extractFieldsWithBounds(mpcPage.formFields, mpcPage.pageNumber);
              const bmrFieldsWithBounds = bmrVerificationService.extractFieldsWithBounds(bmrPage.formFields, bmrPage.pageNumber);
              result = bmrVerificationService.compareFieldsWithBounds(
                mpcFieldsWithBounds, bmrFieldsWithBounds,
                mpcFields, bmrFields,
                mpcPage.formFields, bmrPage.formFields,
                mpcPage.pageNumber, bmrPage.pageNumber
              );
            } else {
              result = bmrVerificationService.compareFields(mpcFields, bmrFields);
            }

            const bmrAlerts = convertBMRDiscrepanciesToAlerts(
              result.discrepancies as any,
              result.matchedFields,
              mpcPage.pageNumber,
              bmrPage.pageNumber
            );
            verificationAlerts.push(...bmrAlerts);
            console.log(`[AUTO-VERIFY] BMR: ${bmrAlerts.length} alerts generated (${result.discrepancies.length} discrepancies)`);
          } else {
            console.log(`[AUTO-VERIFY] BMR: No MPC/BMR page pair detected, skipping`);
          }
        } catch (bmrError: any) {
          console.warn("[AUTO-VERIFY] BMR verification failed:", bmrError.message);
        }

        // 2. Raw Material Verification — detect limits and actuals pages
        try {
          const pageClassifications = rawMaterialVerificationService.classifyPages(
            pagesWithData.map(p => ({ pageNumber: p.pageNumber, rawText: p.rawText }))
          );
          
          const limitsPages = pageClassifications.filter(pc => pc.pageType === "limits");
          const verificationPages = pageClassifications.filter(pc => pc.pageType === "verification");

          if (limitsPages.length > 0 && verificationPages.length > 0) {
            console.log(`[AUTO-VERIFY] Raw Material: ${limitsPages.length} limits pages, ${verificationPages.length} verification pages`);
            
            let allLimits: any[] = [];
            let allActuals: any[] = [];

            for (const lp of limitsPages) {
              const pageData = pagesWithData.find(p => p.pageNumber === lp.pageNumber);
              if (pageData) {
                const limits = rawMaterialVerificationService.extractLimitsFromPage(pageData.tables, pageData.rawText);
                allLimits.push(...limits);
              }
            }

            for (const vp of verificationPages) {
              const pageData = pagesWithData.find(p => p.pageNumber === vp.pageNumber);
              if (pageData) {
                const actuals = rawMaterialVerificationService.extractActualsFromPage(pageData.tables, pageData.rawText);
                allActuals.push(...actuals);
              }
            }

            if (allLimits.length > 0 || allActuals.length > 0) {
              const rawMatResults = rawMaterialVerificationService.compareAndValidate(allLimits, allActuals);
              const rawMatAlerts = convertRawMaterialResultsToAlerts(rawMatResults);
              verificationAlerts.push(...rawMatAlerts);
              console.log(`[AUTO-VERIFY] Raw Material: ${rawMatAlerts.length} alerts generated (${rawMatResults.length} materials checked)`);
            }
          } else {
            console.log(`[AUTO-VERIFY] Raw Material: No limits/verification page pair detected, skipping`);
          }
        } catch (rawMatError: any) {
          console.warn("[AUTO-VERIFY] Raw material verification failed:", rawMatError.message);
        }

        // 3. Batch Allocation Verification — detect batch allocation data
        try {
          const allText = pagesWithData.map(p => p.rawText).join("\n");
          const allTables = pagesWithData.flatMap(p => p.tables);
          
          const extraction = batchAllocationVerificationService.extractFromDocument(allText, allTables);
          
          const hasRelevantData = extraction.batchNumber || extraction.manufacturingDate || 
                                  extraction.expiryDate || extraction.isCompliant !== null;
          
          if (hasRelevantData) {
            console.log(`[AUTO-VERIFY] Batch Allocation: Found data - Batch: ${extraction.batchNumber}, Mfg: ${extraction.manufacturingDate}, Exp: ${extraction.expiryDate}`);
            const batchAllocAlerts = convertBatchAllocationToAlerts(extraction);
            verificationAlerts.push(...batchAllocAlerts);
            console.log(`[AUTO-VERIFY] Batch Allocation: ${batchAllocAlerts.length} alerts generated`);
          } else {
            console.log(`[AUTO-VERIFY] Batch Allocation: No relevant data detected, skipping`);
          }
        } catch (batchAllocError: any) {
          console.warn("[AUTO-VERIFY] Batch allocation verification failed:", batchAllocError.message);
        }

        // Step 4: User-declared fields verification
        try {
          const currentDoc = await storage.getDocument(documentId);
          const userFields = currentDoc?.userDeclaredFields as UserDeclaredFields | null;
          if (userFields) {
            console.log(`[AUTO-VERIFY] User-Declared Fields: Running comparison...`);
            const extracted = extractBatchFieldsFromPages(pagesWithData);
            console.log(`[AUTO-VERIFY] Extracted fields: Product="${extracted.productName}", Batch="${extracted.batchNo}", MfgDate="${extracted.manufacturingDate}", ExpDate="${extracted.expiryDate}"`);
            const userDeclaredAlerts = compareUserDeclaredFields(userFields, extracted);
            verificationAlerts.push(...userDeclaredAlerts);
            console.log(`[AUTO-VERIFY] User-Declared Fields: ${userDeclaredAlerts.length} alerts generated`);
          } else {
            console.log(`[AUTO-VERIFY] User-Declared Fields: No user-declared fields provided, skipping`);
          }
        } catch (userDeclaredError: any) {
          console.warn("[AUTO-VERIFY] User-declared fields verification failed:", userDeclaredError.message);
        }

        // Store verification alerts in the document (and clear cached QA checklist for re-evaluation)
        if (verificationAlerts.length > 0) {
          await storage.updateDocument(documentId, { verificationAlerts, qaChecklist: null });
          console.log(`[AUTO-VERIFY] Stored ${verificationAlerts.length} total verification alerts for document ${documentId}`);
        }
      } catch (verifyError: any) {
        console.warn("[AUTO-VERIFY] Auto-verification pipeline error:", verifyError.message);
      }

      await storage.updateDocument(documentId, { status: "completed" });
      
      // Log processing completion
      await logEvent("processing_complete", "success", {
        documentId,
        metadata: {
          totalPages: processedPages.length,
          usedFallback,
          fallbackReason: usedFallback ? fallbackReason : undefined,
          verificationAlerts: verificationAlerts.length,
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
        errorMessage: error.message,
      });
      throw error;
    }
  }

  // ==========================================
  // BMR VERIFICATION ROUTES
  // ==========================================

  // Upload PDF and run BMR verification
  app.post("/api/bmr-verification/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({ error: "Only PDF files are supported" });
      }

      // Create verification record
      const verification = await storage.createBMRVerification({
        filename: req.file.originalname,
        fileSize: req.file.size,
        status: "pending",
      });

      // Start verification process asynchronously
      processBMRVerification(verification.id, req.file.buffer).catch(error => {
        console.error("Error processing BMR verification:", error);
        storage.updateBMRVerification(verification.id, {
          status: "failed",
          errorMessage: error.message,
        });
      });

      res.json(verification);
    } catch (error: any) {
      console.error("BMR verification upload error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all BMR verifications
  app.get("/api/bmr-verification", async (_req, res) => {
    try {
      const verifications = await storage.getAllBMRVerifications();
      res.json(verifications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get BMR verification by ID
  app.get("/api/bmr-verification/:id", async (req, res) => {
    try {
      const verification = await storage.getBMRVerification(req.params.id);
      if (!verification) {
        return res.status(404).json({ error: "Verification not found" });
      }
      res.json(verification);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get BMR verification result with discrepancies
  app.get("/api/bmr-verification/:id/result", async (req, res) => {
    try {
      const verification = await storage.getBMRVerification(req.params.id);
      if (!verification) {
        return res.status(404).json({ error: "Verification not found" });
      }

      const discrepancies = await storage.getDiscrepanciesByVerification(req.params.id);
      
      const allFields = [
        "product_name", "product_code", "batch_size", "unit_of_measure",
        "expiry_date", "shelf_life", "physical_description", "dimensions_weight",
        "active_ingredients", "storage_conditions", "manufacturing_location",
        "equipment_required", "quality_control_checkpoints"
      ];
      
      const mpcData = verification.extractedMpcData || {};
      const bmrData = verification.extractedBmrData || {};
      
      const fieldsWithData = allFields.filter(field => 
        mpcData[field] || bmrData[field]
      );
      
      const discrepancyFields = discrepancies.map(d => d.fieldName);
      const matchedFields = fieldsWithData.filter(field => 
        !discrepancyFields.includes(field)
      );
      
      const totalFieldsCompared = fieldsWithData.length;

      res.json({
        verification,
        discrepancies,
        matchedFields,
        totalFieldsCompared,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete BMR verification
  app.delete("/api/bmr-verification/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteBMRVerification(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Verification not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get pages for a BMR verification
  app.get("/api/bmr-verification/:id/pages", async (req, res) => {
    try {
      const verification = await storage.getBMRVerification(req.params.id);
      if (!verification) {
        return res.status(404).json({ error: "Verification not found" });
      }

      if (!verification.documentId) {
        return res.json({ pages: [] });
      }

      const pages = await storage.getPagesByDocument(verification.documentId);
      res.json({ pages });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Process BMR verification function
  async function processBMRVerification(verificationId: string, pdfBuffer: Buffer) {
    try {
      console.log(`[BMR-VERIFY] Starting verification ${verificationId}`);
      await storage.updateBMRVerification(verificationId, { status: "processing" });

      // Get verification record to access filename
      const verification = await storage.getBMRVerification(verificationId);
      if (!verification) {
        throw new Error("Verification record not found");
      }

      // Create a document record to store page images
      const document = await storage.createDocument({
        filename: verification.filename,
        fileSize: verification.fileSize,
        status: "processing",
        documentType: "bmr_verification",
      });
      console.log(`[BMR-VERIFY] Created document ${document.id} for verification`);

      // Link document to verification
      await storage.updateBMRVerification(verificationId, { documentId: document.id });

      // Extract text from each page using PDF processor
      const pageCount = await pdfProcessor.getPageCount(pdfBuffer);
      console.log(`[BMR-VERIFY] PDF has ${pageCount} pages`);

      // Extract page images for viewing
      try {
        const pageImagePaths = await pdfProcessor.extractPageImages(pdfBuffer, document.id);
        console.log(`[BMR-VERIFY] Extracted ${pageImagePaths.length} page images`);

        // Create page records with images
        for (let i = 0; i < pageImagePaths.length; i++) {
          await storage.createPage({
            documentId: document.id,
            pageNumber: i + 1,
            classification: "bmr_verification",
            confidence: 100,
            imagePath: pageImagePaths[i],
            extractedText: "",
            metadata: {},
          });
        }
        console.log(`[BMR-VERIFY] Created ${pageImagePaths.length} page records`);
      } catch (imageError: any) {
        console.warn(`[BMR-VERIFY] Failed to extract page images: ${imageError.message}`);
      }
      
      const pageTexts: Array<{ pageNumber: number; text: string }> = [];

      // Helper function to extract text using pdfjs-dist legacy build
      const extractWithPdfJs = async (): Promise<void> => {
        try {
          // Use legacy build for Node.js environments
          const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
          
          // Load PDF document from buffer with additional options
          const loadingTask = pdfjsLib.getDocument({ 
            data: new Uint8Array(pdfBuffer),
            useSystemFonts: true,
            verbosity: 0
          });
          const pdfDoc = await loadingTask.promise;
          
          console.log(`[BMR-VERIFY] pdfjs-dist loaded ${pdfDoc.numPages} pages`);
          
          // Extract text from each page
          for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent({ 
              includeMarkedContent: true,
              disableNormalization: false
            });
            
            console.log(`[BMR-VERIFY] Page ${i} raw items count: ${textContent.items.length}`);
            
            // Log first few items for debugging
            if (textContent.items.length > 0) {
              console.log(`[BMR-VERIFY] Page ${i} first 3 items:`, 
                JSON.stringify(textContent.items.slice(0, 3)));
            }
            
            const pageText = textContent.items
              .filter((item: any) => item.str !== undefined)
              .map((item: any) => item.str)
              .join(' ');
            
            console.log(`[BMR-VERIFY] Page ${i} text length: ${pageText.length}`);
            console.log(`[BMR-VERIFY] Page ${i} text preview: "${pageText.substring(0, 300).replace(/\n/g, ' ')}..."`);
            
            pageTexts.push({ pageNumber: i, text: pageText });
          }
          
          // Check if all pages have 0 text - likely an image-based PDF
          const totalText = pageTexts.reduce((sum, p) => sum + p.text.length, 0);
          if (totalText === 0) {
            console.warn(`[BMR-VERIFY] WARNING: No text extracted from any page. This PDF is likely image-based (scanned). Google Document AI credentials are required for OCR.`);
          }
        } catch (pdfJsError: any) {
          console.error(`[BMR-VERIFY] pdfjs-dist failed: ${pdfJsError.message}`);
          console.error(`[BMR-VERIFY] Error stack: ${pdfJsError.stack}`);
          // Last resort fallback
          for (let i = 0; i < pageCount; i++) {
            pageTexts.push({ 
              pageNumber: i + 1, 
              text: '' 
            });
          }
        }
      };

      // Form fields with bounding boxes from Document AI
      const pageFormFields: Array<{ pageNumber: number; formFields: any[] }> = [];
      let usedDocumentAI = false;
      
      // Use Document AI if available, otherwise use pdfjs-dist for text extraction
      if (documentAI) {
        try {
          console.log(`[BMR-VERIFY] Using Document AI for text extraction`);
          const docAIDocument = await documentAI.processDocument(pdfBuffer);
          const totalPages = documentAI.getTotalPages(docAIDocument);
          usedDocumentAI = true;
          
          for (let i = 0; i < totalPages; i++) {
            const pageText = documentAI.extractPageText(docAIDocument, i);
            console.log(`[BMR-VERIFY] Page ${i + 1} extracted, text length: ${pageText.length}`);
            pageTexts.push({ pageNumber: i + 1, text: pageText });
            
            // Extract form fields with bounding boxes
            try {
              const extraction = documentAI.extractPageData(docAIDocument, i);
              if (extraction && extraction.formFields && extraction.formFields.length > 0) {
                console.log(`[BMR-VERIFY] Page ${i + 1}: extracted ${extraction.formFields.length} form fields with bounding boxes`);
                pageFormFields.push({
                  pageNumber: i + 1,
                  formFields: extraction.formFields.map((f: any) => ({
                    fieldName: f.fieldName,
                    fieldValue: f.fieldValue,
                    confidence: f.confidence,
                    nameBoundingBox: f.nameBoundingBox,
                    valueBoundingBox: f.valueBoundingBox
                  }))
                });
              }
            } catch (formFieldError: any) {
              console.warn(`[BMR-VERIFY] Page ${i + 1} form field extraction failed: ${formFieldError.message}`);
            }
          }
        } catch (docAIError: any) {
          console.warn(`[BMR-VERIFY] Document AI failed: ${docAIError.message}, using pdfjs-dist fallback`);
          await extractWithPdfJs();
        }
      } else {
        console.log(`[BMR-VERIFY] Document AI not configured, using pdfjs-dist for text extraction`);
        await extractWithPdfJs();
      }
      
      // Log what will be sent to the verification service
      console.log(`[BMR-VERIFY] Total pages to verify: ${pageTexts.length}`);
      for (const pt of pageTexts) {
        const docType = bmrVerificationService.identifyDocumentType(pt.text);
        console.log(`[BMR-VERIFY] Page ${pt.pageNumber}: detected as "${docType}", text length: ${pt.text.length}`);
        if (docType === "unknown" && pt.text.length > 0) {
          console.log(`[BMR-VERIFY] Page ${pt.pageNumber} keywords check - looking for: "master copy", "master product card", "bmr", "batch manufacturing record"...`);
          console.log(`[BMR-VERIFY] Page ${pt.pageNumber} first 300 chars: "${pt.text.substring(0, 300).toLowerCase().replace(/\n/g, ' ')}"`);
        }
      }

      // Run verification - use method with bounding boxes if we have form fields from Document AI
      const result = usedDocumentAI && pageFormFields.length > 0
        ? await bmrVerificationService.processAndVerifyWithBounds(pageTexts, pageFormFields)
        : await bmrVerificationService.processAndVerify(pageTexts);
      console.log(`[BMR-VERIFY] Verification result:`, { 
        mpcPage: result.mpcPageNumber, 
        bmrPage: result.bmrPageNumber, 
        error: result.error,
        usedBoundingBoxes: usedDocumentAI && pageFormFields.length > 0
      });

      if (result.error) {
        await storage.updateBMRVerification(verificationId, {
          status: "failed",
          errorMessage: result.error,
          masterProductCardPage: result.mpcPageNumber,
          bmrPage: result.bmrPageNumber,
        });
        return;
      }

      if (!result.verificationResult) {
        await storage.updateBMRVerification(verificationId, {
          status: "failed",
          errorMessage: "Verification could not be completed",
        });
        return;
      }

      // Store discrepancies with bounding boxes
      for (const discrepancy of result.verificationResult.discrepancies) {
        await storage.createBMRDiscrepancy({
          verificationId,
          fieldName: discrepancy.fieldName,
          mpcValue: discrepancy.mpcValue,
          bmrValue: discrepancy.bmrValue,
          severity: discrepancy.severity,
          description: discrepancy.description,
          section: discrepancy.section,
          mpcBoundingBox: discrepancy.mpcBoundingBox || null,
          bmrBoundingBox: discrepancy.bmrBoundingBox || null,
        });
      }

      // Update verification with results
      await storage.updateBMRVerification(verificationId, {
        status: "completed",
        completedAt: new Date(),
        totalDiscrepancies: result.verificationResult.discrepancies.length,
        masterProductCardPage: result.mpcPageNumber,
        bmrPage: result.bmrPageNumber,
        extractedMpcData: result.verificationResult.mpcData,
        extractedBmrData: result.verificationResult.bmrData,
      });

      // Update document status to completed
      const updatedVerification = await storage.getBMRVerification(verificationId);
      if (updatedVerification?.documentId) {
        await storage.updateDocument(updatedVerification.documentId, { status: "completed" });
      }

    } catch (error: any) {
      console.error("BMR verification processing error:", error);
      
      // Update verification status
      await storage.updateBMRVerification(verificationId, {
        status: "failed",
        errorMessage: error.message,
      });
      
      // Also update document status if it was created
      const failedVerification = await storage.getBMRVerification(verificationId);
      if (failedVerification?.documentId) {
        await storage.updateDocument(failedVerification.documentId, { status: "failed" });
      }
      
      throw error;
    }
  }

  // ==========================================
  // Raw Material Verification Endpoints (Simplified Single-PDF Workflow)
  // ==========================================

  // Upload single PDF with limits page and verification page
  app.post("/api/raw-material/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (!documentAI) {
        return res.status(500).json({ error: "Document AI is not configured for document processing" });
      }

      // Create document record for approval workflow
      const document = await storage.createDocument({
        filename: req.file.originalname,
        fileSize: req.file.size,
        documentType: "raw_material",
      });

      // Log document upload event
      await logEvent("document_upload", "success", {
        documentId: document.id,
        metadata: {
          filename: req.file.originalname,
          fileSize: req.file.size,
          documentType: "raw_material",
        },
      });

      // Process the PDF document with Document AI
      const pdfBuffer = req.file.buffer;
      const docAIResult = await documentAI.processDocument(pdfBuffer);
      const totalPages = documentAI.getTotalPages(docAIResult);

      if (totalPages < 2) {
        await storage.updateDocument(document.id, {
          status: "failed",
          errorMessage: "PDF must contain at least 2 pages"
        });
        await logEvent("processing_failed", "failed", {
          documentId: document.id,
          errorMessage: "PDF must contain at least 2 pages",
        });
        return res.status(400).json({ 
          error: "PDF must contain at least 2 pages",
          details: "Upload a PDF with one page containing material limits and another with actual values"
        });
      }

      // Extract page images for document viewer
      let pageImages: string[] = [];
      try {
        console.log(`[RAW-MATERIAL] Extracting images for ${totalPages} pages...`);
        pageImages = await pdfProcessor.extractPageImages(pdfBuffer, document.id);
        console.log(`[RAW-MATERIAL] Successfully extracted ${pageImages.length} page images`);
      } catch (imageError: any) {
        console.warn("[RAW-MATERIAL] Failed to extract page images:", imageError.message);
        // Continue without images - they're not critical for verification
      }

      // Extract data from each page
      const pagesData: { pageNumber: number; tables: any[]; rawText: string }[] = [];
      for (let i = 0; i < totalPages; i++) {
        const pageData = documentAI.extractPageData(docAIResult, i);
        pagesData.push({
          pageNumber: i + 1,
          tables: pageData?.tables || [],
          rawText: pageData?.extractedText || ""
        });
      }

      // Combine all text for MPC/BMR number extraction
      const allText = pagesData.map(p => p.rawText).join("\n");
      
      // Extract MPC/BMR numbers from document text
      const mpcMatch = allText.match(/MPC[-\s]?(\d{4}[-/]?\d{3,})/i) || 
                       allText.match(/Master\s*Product\s*Card\s*[:#]?\s*(\S+)/i);
      const bmrMatch = allText.match(/BMR[-\s]?(\d{4}[-/]?\d{3,})/i) ||
                       allText.match(/Batch\s*(?:Manufacturing\s*)?Record\s*[:#]?\s*(\S+)/i);
      
      const mpcNumber = mpcMatch ? mpcMatch[1] || mpcMatch[0] : req.file.originalname.replace(/\.[^.]+$/, "");
      const bmrNumber = bmrMatch ? bmrMatch[1] || bmrMatch[0] : null;

      console.log(`[RAW-MATERIAL] Processed ${totalPages} pages, MPC: ${mpcNumber}, BMR: ${bmrNumber}`);
      
      // Debug logging for table extraction
      for (const page of pagesData) {
        console.log(`[RAW-MATERIAL] Page ${page.pageNumber}: ${page.tables.length} tables, text length: ${page.rawText.length}`);
        for (let t = 0; t < page.tables.length; t++) {
          const table = page.tables[t];
          console.log(`[RAW-MATERIAL]   Table ${t}: ${table.rows?.length || 0} rows`);
          if (table.rows && table.rows.length > 0) {
            const firstRow = table.rows[0]?.cells?.map((c: any) => typeof c === 'string' ? c : c.text || '').join(' | ');
            console.log(`[RAW-MATERIAL]     First row: ${firstRow?.substring(0, 200)}`);
          }
        }
        console.log(`[RAW-MATERIAL]   Raw text snippet: ${page.rawText.substring(0, 300)}`);
      }

      // Create verification record linked to document
      const verification = await storage.createRawMaterialVerification({
        documentId: document.id,
        mpcNumber,
        bmrNumber,
        filename: req.file.originalname,
        fileSize: req.file.size,
        status: "processing",
      });

      // Classify pages to identify limits vs verification
      const classifications = rawMaterialVerificationService.classifyPages(
        pagesData.map(p => ({ pageNumber: p.pageNumber, rawText: p.rawText }))
      );

      const limitsPage = classifications.find(c => c.pageType === "limits");
      const verificationPageClassified = classifications.find(c => c.pageType === "verification");

      if (!limitsPage) {
        // Default: first page is limits
        classifications[0].pageType = "limits";
      }
      if (!verificationPageClassified && totalPages > 1) {
        // Default: second page is verification
        const nonLimitsPage = classifications.find(c => c.pageType !== "limits");
        if (nonLimitsPage) nonLimitsPage.pageType = "verification";
        else classifications[1].pageType = "verification";
      }

      // Create page records for document viewer display
      for (const pageData of pagesData) {
        const classification = classifications.find(c => c.pageNumber === pageData.pageNumber);
        const classificationLabel = classification?.pageType === "limits" 
          ? "raw_material_limits" 
          : classification?.pageType === "verification" 
            ? "raw_material_verification" 
            : "raw_material_other";
        
        await storage.createPage({
          documentId: document.id,
          pageNumber: pageData.pageNumber,
          classification: classificationLabel,
          confidence: classification?.confidence || 0.8,
          extractedText: pageData.rawText,
          imagePath: pageImages[pageData.pageNumber - 1] || null,
          issues: [],
          metadata: {
            pageType: classification?.pageType || "unknown",
            tables: pageData.tables,
          } as Record<string, any>,
        });
      }
      console.log(`[RAW-MATERIAL] Created ${pagesData.length} page records`);

      const limitsPageData = pagesData.find(p => 
        classifications.find(c => c.pageNumber === p.pageNumber && c.pageType === "limits")
      );
      const verificationPageData = pagesData.find(p => 
        classifications.find(c => c.pageNumber === p.pageNumber && c.pageType === "verification")
      );

      if (!limitsPageData || !verificationPageData) {
        await storage.updateRawMaterialVerification(verification.id, {
          status: "failed",
          errorMessage: "Could not identify limits and verification pages"
        });
        await storage.updateDocument(document.id, {
          status: "failed",
          errorMessage: "Could not identify limits and verification pages"
        });
        await logEvent("processing_failed", "failed", {
          documentId: document.id,
          errorMessage: "Could not identify limits and verification pages",
        });
        return res.status(400).json({ 
          error: "Could not identify limits and verification pages",
          details: "Ensure the PDF has a page with material limits (ranges) and a page with actual values"
        });
      }

      // Extract limits from limits page
      const limits = rawMaterialVerificationService.extractLimitsFromPage(
        limitsPageData.tables,
        limitsPageData.rawText
      );

      if (limits.length === 0) {
        await storage.updateRawMaterialVerification(verification.id, {
          status: "failed",
          errorMessage: "No material limits could be extracted from the limits page"
        });
        await storage.updateDocument(document.id, {
          status: "failed",
          errorMessage: "No material limits could be extracted from the limits page"
        });
        await logEvent("processing_failed", "failed", {
          documentId: document.id,
          errorMessage: "No material limits found",
        });
        return res.status(400).json({ 
          error: "No material limits found",
          details: "The limits page should contain a table with material codes and min/max ranges"
        });
      }

      // Extract actual values from verification page
      const actuals = rawMaterialVerificationService.extractActualsFromPage(
        verificationPageData.tables,
        verificationPageData.rawText
      );

      // Compare limits against actuals
      const results = rawMaterialVerificationService.compareAndValidate(limits, actuals);

      // Store results
      for (const result of results) {
        await storage.createRawMaterialResult({
          verificationId: verification.id,
          materialCode: result.materialCode,
          materialName: result.materialName,
          bomQuantity: result.limitRange,
          actualQuantity: result.actualDisplay,
          actualQuantityValue: result.actualValue ? Math.round(result.actualValue * 100) : null,
          withinLimits: result.withinLimits,
          toleranceDisplay: result.limitRange,
          criticality: "non-critical",
          deviationPercent: null,
          notes: result.notes,
        });
      }

      // Calculate summary
      const materialsWithinLimits = results.filter(r => r.withinLimits === true).length;
      const materialsOutOfLimits = results.filter(r => r.withinLimits === false).length;

      // Update verification record
      await storage.updateRawMaterialVerification(verification.id, {
        status: "completed",
        completedAt: new Date(),
        totalMaterials: results.length,
        materialsWithinLimits,
        materialsOutOfLimits,
      });

      // Update document record
      await storage.updateDocument(document.id, {
        status: "completed",
        totalPages,
      });

      // Log processing completion
      await logEvent("processing_complete", "success", {
        documentId: document.id,
        metadata: {
          totalPages,
          verificationType: "raw_material",
          totalMaterials: results.length,
          materialsWithinLimits,
          materialsOutOfLimits,
        },
      });

      res.json({
        documentId: document.id,
        verificationId: verification.id,
        status: "completed",
        limitsPage: limitsPageData.pageNumber,
        verificationPage: verificationPageData.pageNumber,
        limitsExtracted: limits.length,
        actualsExtracted: actuals.length,
        totalMaterials: results.length,
        materialsWithinLimits,
        materialsOutOfLimits,
        results,
        pageClassifications: classifications
      });
    } catch (error: any) {
      console.error("Raw material verification error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all raw material verifications
  app.get("/api/raw-material/verifications", async (_req, res) => {
    try {
      const verifications = await storage.getAllRawMaterialVerifications();
      res.json(verifications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get raw material verification by ID with results
  app.get("/api/raw-material/verifications/:id", async (req, res) => {
    try {
      const verification = await storage.getRawMaterialVerification(req.params.id);
      if (!verification) {
        return res.status(404).json({ error: "Verification not found" });
      }
      const results = await storage.getRawMaterialResultsByVerification(req.params.id);
      res.json({ verification, results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete raw material verification
  app.delete("/api/raw-material/verifications/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteRawMaterialVerification(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Verification not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================
  // Batch Allocation Verification Endpoints
  // ==========================================

  // Upload and verify batch allocation document
  app.post("/api/batch-allocation/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Create document record for approval workflow
      const document = await storage.createDocument({
        filename: req.file.originalname,
        fileSize: req.file.size,
        documentType: "batch_allocation",
      });

      // Log document upload event
      await logEvent("document_upload", "success", {
        documentId: document.id,
        metadata: {
          filename: req.file.originalname,
          fileSize: req.file.size,
          documentType: "batch_allocation",
        },
      });

      // Create verification record linked to document
      const verification = await storage.createBatchAllocationVerification({
        documentId: document.id,
        filename: req.file.originalname,
        fileSize: req.file.size,
        status: "processing",
      });

      if (!documentAI) {
        await storage.updateBatchAllocationVerification(verification.id, {
          status: "failed",
          errorMessage: "Document AI is not configured for document processing"
        });
        await storage.updateDocument(document.id, {
          status: "failed",
          errorMessage: "Document AI is not configured for document processing"
        });
        await logEvent("processing_failed", "failed", {
          documentId: document.id,
          errorMessage: "Document AI is not configured",
        });
        return res.status(500).json({ error: "Document AI is not configured for document processing" });
      }

      // Process the document with Document AI
      const pdfBuffer = req.file.buffer;
      const docAIResult = await documentAI.processDocument(pdfBuffer);
      const totalPages = documentAI.getTotalPages(docAIResult);

      // Extract data from all pages
      let allText = "";
      const allTables: any[] = [];
      
      for (let i = 0; i < totalPages; i++) {
        const pageData = documentAI.extractPageData(docAIResult, i);
        allText += (pageData?.extractedText || "") + "\n";
        if (pageData?.tables) {
          allTables.push(...pageData.tables);
        }
      }

      console.log(`[BATCH-ALLOCATION] Processed ${totalPages} pages, text length: ${allText.length}`);

      // Extract batch allocation data
      const extraction = batchAllocationVerificationService.extractFromDocument(allText, allTables);

      // Update verification with extracted data
      await storage.updateBatchAllocationVerification(verification.id, {
        status: "completed",
        completedAt: new Date(),
        batchNumber: extraction.batchNumber,
        mpcNumber: extraction.mpcNumber,
        bmrNumber: extraction.bmrNumber,
        manufacturingDate: extraction.manufacturingDate,
        expiryDate: extraction.expiryDate,
        shelfLifeMonths: extraction.shelfLifeMonths,
        shelfLifeCalculated: extraction.shelfLifeCalculated,
        isCompliant: extraction.isCompliant,
        datesMatch: extraction.datesMatch,
        qaOfficer: extraction.qaOfficer,
        verificationDate: extraction.verificationDate,
        extractedData: {
          rawMaterials: extraction.rawMaterials,
          totalPages,
        },
      });

      // Update document record
      await storage.updateDocument(document.id, {
        status: "completed",
        totalPages,
      });

      // Log processing completion
      await logEvent("processing_complete", "success", {
        documentId: document.id,
        metadata: {
          totalPages,
          verificationType: "batch_allocation",
        },
      });

      res.json({
        documentId: document.id,
        verificationId: verification.id,
        status: "completed",
        ...extraction,
        totalPages,
      });
    } catch (error: any) {
      console.error("Batch allocation verification error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all batch allocation verifications
  app.get("/api/batch-allocation/verifications", async (_req, res) => {
    try {
      const verifications = await storage.getAllBatchAllocationVerifications();
      res.json(verifications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get batch allocation verification by ID
  app.get("/api/batch-allocation/verifications/:id", async (req, res) => {
    try {
      const verification = await storage.getBatchAllocationVerification(req.params.id);
      if (!verification) {
        return res.status(404).json({ error: "Verification not found" });
      }
      res.json(verification);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete batch allocation verification
  app.delete("/api/batch-allocation/verifications/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteBatchAllocationVerification(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Verification not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================
  // Document Approval Endpoints
  // ==========================================

  // Approve/disapprove document
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
      
      const updates: any = {
        isApproved,
        approvedBy: isApproved ? userId : null,
        approvedAt: isApproved ? new Date() : null,
      };
      
      const updated = await storage.updateDocument(documentId, updates);
      
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

  // ==========================================
  // Issue Resolution Endpoints
  // ==========================================

  // Resolve an issue (approve or reject) with mandatory comment
  app.post("/api/issues/:issueId/resolve", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "User ID required" });
      }
      
      const { issueId } = req.params;
      const { status, comment } = req.body;
      
      if (!status || !["approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
      }
      
      if (!comment || typeof comment !== "string" || comment.trim().length === 0) {
        return res.status(400).json({ error: "Comment is required for issue resolution" });
      }
      
      const issue = await storage.getQualityIssue(issueId);
      if (!issue) {
        return res.status(404).json({ error: "Issue not found" });
      }
      
      const previousStatus = issue.resolutionStatus;
      
      const resolution = await storage.createIssueResolution({
        issueId,
        documentId: issue.documentId,
        resolverId: userId,
        status,
        comment: comment.trim(),
        previousStatus,
      });
      
      const updatedIssue = await storage.updateQualityIssue(issueId, {
        resolutionStatus: status,
        resolvedBy: userId,
        resolvedAt: new Date(),
        resolutionComment: comment.trim(),
        resolved: status === "approved",
      });
      
      await logEvent(status === "approved" ? "issue_approved" : "issue_rejected", "success", {
        documentId: issue.documentId,
        userId,
        metadata: {
          issueId,
          issueType: issue.issueType,
          severity: issue.severity,
          description: issue.description,
          pageNumbers: issue.pageNumbers,
          previousStatus,
          newStatus: status,
          comment: comment.trim(),
        },
      });
      
      res.json({
        issue: updatedIssue,
        resolution,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get resolution history for a specific issue
  app.get("/api/issues/:issueId/resolutions", async (req, res) => {
    try {
      const { issueId } = req.params;
      
      const issue = await storage.getQualityIssue(issueId);
      if (!issue) {
        return res.status(404).json({ error: "Issue not found" });
      }
      
      const resolutions = await storage.getIssueResolutions(issueId);
      
      res.json({
        issue,
        resolutions,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get issues with resolutions for a document
  app.get("/api/documents/:id/issues-with-resolutions", async (req, res) => {
    try {
      const issuesWithResolutions = await storage.getIssuesWithResolutions(req.params.id);
      res.json(issuesWithResolutions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
