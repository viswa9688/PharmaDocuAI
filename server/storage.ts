import type { 
  Document, 
  InsertDocument, 
  Page, 
  InsertPage,
  QualityIssue,
  InsertQualityIssue,
  IssueResolution,
  InsertIssueResolution,
  DocumentSummary 
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Documents
  createDocument(doc: InsertDocument, uploadedBy?: string | null): Promise<Document>;
  getDocument(id: string): Promise<Document | undefined>;
  getAllDocuments(): Promise<Document[]>;
  updateDocument(id: string, updates: Partial<Document>): Promise<Document | undefined>;
  deleteDocument(id: string): Promise<boolean>;

  // Pages
  createPage(page: InsertPage): Promise<Page>;
  getPagesByDocument(documentId: string): Promise<Page[]>;
  getPage(id: string): Promise<Page | undefined>;

  // Quality Issues
  createQualityIssue(issue: InsertQualityIssue): Promise<QualityIssue>;
  getIssuesByDocument(documentId: string): Promise<QualityIssue[]>;
  getQualityIssue(id: string): Promise<QualityIssue | undefined>;
  updateQualityIssue(id: string, updates: Partial<QualityIssue>): Promise<QualityIssue | undefined>;

  // Issue Resolutions
  createIssueResolution(resolution: InsertIssueResolution): Promise<IssueResolution>;
  getIssueResolutions(issueId: string): Promise<IssueResolution[]>;
  getDocumentIssueResolutions(documentId: string): Promise<IssueResolution[]>;
  getIssuesWithResolutions(documentId: string): Promise<{ issue: QualityIssue; resolutions: IssueResolution[] }[]>;

  // Summary
  getDocumentSummary(documentId: string): Promise<DocumentSummary | undefined>;
}

export class MemStorage implements IStorage {
  private documents: Map<string, Document>;
  private pages: Map<string, Page>;
  private qualityIssues: Map<string, QualityIssue>;
  private issueResolutions: Map<string, IssueResolution>;

  constructor() {
    this.documents = new Map();
    this.pages = new Map();
    this.qualityIssues = new Map();
    this.issueResolutions = new Map();
  }

  // Documents
  async createDocument(insertDoc: InsertDocument, uploadedBy?: string | null): Promise<Document> {
    const id = randomUUID();
    const doc: Document = {
      ...insertDoc,
      id,
      uploadedAt: new Date(),
      uploadedBy: uploadedBy || null,
      status: insertDoc.status || "pending",
      totalPages: null,
      processedPages: 0,
      errorMessage: null,
      batchDateBounds: null,
    };
    this.documents.set(id, doc);
    return doc;
  }

  async getDocument(id: string): Promise<Document | undefined> {
    return this.documents.get(id);
  }

  async getAllDocuments(): Promise<Document[]> {
    return Array.from(this.documents.values()).sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  }

  async updateDocument(id: string, updates: Partial<Document>): Promise<Document | undefined> {
    const doc = this.documents.get(id);
    if (!doc) return undefined;

    const updated = { ...doc, ...updates };
    this.documents.set(id, updated);
    return updated;
  }

  async deleteDocument(id: string): Promise<boolean> {
    // Delete related pages and issues
    const pages = await this.getPagesByDocument(id);
    pages.forEach(page => this.pages.delete(page.id));

    const issues = await this.getIssuesByDocument(id);
    issues.forEach(issue => this.qualityIssues.delete(issue.id));

    return this.documents.delete(id);
  }

  // Pages
  async createPage(insertPage: InsertPage): Promise<Page> {
    const id = randomUUID();
    const page: Page = {
      ...insertPage,
      id,
      extractedText: insertPage.extractedText || null,
      issues: (insertPage.issues as string[]) || null,
      metadata: insertPage.metadata || null,
      createdAt: new Date(),
    };
    this.pages.set(id, page);
    return page;
  }

  async getPagesByDocument(documentId: string): Promise<Page[]> {
    return Array.from(this.pages.values())
      .filter(page => page.documentId === documentId)
      .sort((a, b) => a.pageNumber - b.pageNumber);
  }

  async getPage(id: string): Promise<Page | undefined> {
    return this.pages.get(id);
  }

  // Quality Issues
  async createQualityIssue(insertIssue: InsertQualityIssue): Promise<QualityIssue> {
    const id = randomUUID();
    const issue: QualityIssue = {
      ...insertIssue,
      id,
      pageNumbers: (insertIssue.pageNumbers as number[]) || null,
      resolved: false,
      createdAt: new Date(),
    };
    this.qualityIssues.set(id, issue);
    return issue;
  }

  async getIssuesByDocument(documentId: string): Promise<QualityIssue[]> {
    return Array.from(this.qualityIssues.values())
      .filter(issue => issue.documentId === documentId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getQualityIssue(id: string): Promise<QualityIssue | undefined> {
    return this.qualityIssues.get(id);
  }

  async updateQualityIssue(id: string, updates: Partial<QualityIssue>): Promise<QualityIssue | undefined> {
    const issue = this.qualityIssues.get(id);
    if (!issue) return undefined;
    const updated = { ...issue, ...updates };
    this.qualityIssues.set(id, updated);
    return updated;
  }

  // Issue Resolutions
  async createIssueResolution(resolution: InsertIssueResolution): Promise<IssueResolution> {
    const id = randomUUID();
    const created: IssueResolution = {
      ...resolution,
      id,
      previousStatus: resolution.previousStatus || null,
      createdAt: new Date(),
    };
    this.issueResolutions.set(id, created);
    return created;
  }

  async getIssueResolutions(issueId: string): Promise<IssueResolution[]> {
    return Array.from(this.issueResolutions.values())
      .filter(r => r.issueId === issueId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getDocumentIssueResolutions(documentId: string): Promise<IssueResolution[]> {
    return Array.from(this.issueResolutions.values())
      .filter(r => r.documentId === documentId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getIssuesWithResolutions(documentId: string): Promise<{ issue: QualityIssue; resolutions: IssueResolution[] }[]> {
    const issues = await this.getIssuesByDocument(documentId);
    const result = [];
    for (const issue of issues) {
      const resolutions = await this.getIssueResolutions(issue.id);
      result.push({ issue, resolutions });
    }
    return result;
  }

  // Summary
  async getDocumentSummary(documentId: string): Promise<DocumentSummary | undefined> {
    const document = await this.getDocument(documentId);
    if (!document) return undefined;

    const pages = await this.getPagesByDocument(documentId);
    const issues = await this.getIssuesByDocument(documentId);

    const classificationBreakdown: Record<string, number> = {};
    let totalConfidence = 0;

    pages.forEach(page => {
      classificationBreakdown[page.classification] = 
        (classificationBreakdown[page.classification] || 0) + 1;
      totalConfidence += page.confidence;
    });

    return {
      document,
      pageCount: pages.length,
      classificationBreakdown,
      issueCount: issues.length,
      avgConfidence: pages.length > 0 ? Math.round(totalConfidence / pages.length) : 0,
    };
  }
}

export const storage = new MemStorage();
export const memStorage = storage;
