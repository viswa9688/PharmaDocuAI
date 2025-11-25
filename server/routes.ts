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

// Use PostgreSQL database storage for persistence
const storage = new DBStorage();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  const documentAI = createDocumentAIService();
  const classifier = createClassifierService();
  const pdfProcessor = createPDFProcessorService();
  const layoutAnalyzer = new LayoutAnalyzer();
  const signatureAnalyzer = new SignatureAnalyzer();

  // Upload and process document
  app.post("/api/documents/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({ error: "Only PDF files are supported" });
      }

      // Create document record
      const doc = await storage.createDocument({
        filename: req.file.originalname,
        fileSize: req.file.size,
        status: "pending",
      });

      // Start processing asynchronously
      processDocument(doc.id, req.file.buffer).catch(error => {
        console.error("Error processing document:", error);
        storage.updateDocument(doc.id, {
          status: "failed",
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

                // Store page with all rich extraction data, layout analysis, and approvals
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

              // Store page with all rich extraction data, layout analysis, and approvals
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

      await storage.updateDocument(documentId, { status: "completed" });
    } catch (error: any) {
      console.error("Processing error:", error);
      await storage.updateDocument(documentId, {
        status: "failed",
        errorMessage: error.message,
      });
      throw error;
    }
  }

  const httpServer = createServer(app);
  return httpServer;
}
