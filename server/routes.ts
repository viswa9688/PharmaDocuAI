import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { memStorage } from "./storage";
import { createDocumentAIService } from "./services/document-ai";
import { createClassifierService } from "./services/classifier";
import { createPDFProcessorService } from "./services/pdf-processor";

const storage = memStorage;

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

  // Process document function
  async function processDocument(documentId: string, pdfBuffer: Buffer) {
    try {
      await storage.updateDocument(documentId, { status: "processing" });

      // Get page count
      const pageCount = await pdfProcessor.getPageCount(pdfBuffer);
      await storage.updateDocument(documentId, { totalPages: pageCount });

      const processedPages: Array<{ pageNumber: number; text: string; classification: any }> = [];

      // Process with Document AI if available
      if (documentAI) {
        const document = await documentAI.processDocument(pdfBuffer);
        const totalPages = documentAI.getTotalPages(document);

        for (let i = 0; i < totalPages; i++) {
          const pageNumber = i + 1;
          const extractedText = documentAI.extractPageText(document, i);

          // Classify page
          const classification = await classifier.classifyPage(extractedText, pageNumber);

          // Store page
          await storage.createPage({
            documentId,
            pageNumber,
            classification: classification.classification,
            confidence: classification.confidence,
            extractedText,
            issues: [],
            metadata: { reasoning: classification.reasoning },
          });

          processedPages.push({
            pageNumber,
            text: extractedText,
            classification: classification.classification,
          });

          await storage.updateDocument(documentId, { processedPages: pageNumber });
        }
      } else {
        // Fallback: simple processing without Document AI
        for (let i = 0; i < pageCount; i++) {
          const pageNumber = i + 1;

          await storage.createPage({
            documentId,
            pageNumber,
            classification: "unknown",
            confidence: 0,
            extractedText: "",
            issues: ["Document AI service not configured"],
            metadata: {},
          });

          processedPages.push({
            pageNumber,
            text: "",
            classification: "unknown",
          });

          await storage.updateDocument(documentId, { processedPages: pageNumber });
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
