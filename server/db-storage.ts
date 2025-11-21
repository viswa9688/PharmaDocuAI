import { db } from "./db";
import { 
  documents, 
  pages, 
  qualityIssues,
  type Document,
  type InsertDocument,
  type Page,
  type InsertPage,
  type QualityIssue,
  type InsertQualityIssue,
  type DocumentSummary,
} from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import type { IStorage } from "./storage";

export class DBStorage implements IStorage {
  // Documents
  async createDocument(insertDoc: InsertDocument): Promise<Document> {
    const [doc] = await db.insert(documents).values(insertDoc).returning();
    return doc;
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    return doc;
  }

  async getAllDocuments(): Promise<Document[]> {
    return db.select().from(documents).orderBy(desc(documents.uploadedAt));
  }

  async updateDocument(id: string, updates: Partial<Document>): Promise<Document | undefined> {
    const [updated] = await db
      .update(documents)
      .set(updates)
      .where(eq(documents.id, id))
      .returning();
    return updated;
  }

  async deleteDocument(id: string): Promise<boolean> {
    const result = await db.delete(documents).where(eq(documents.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Pages
  async createPage(insertPage: InsertPage): Promise<Page> {
    const pageData = {
      ...insertPage,
      extractedText: insertPage.extractedText || null,
      issues: (insertPage.issues as string[]) || null,
      metadata: insertPage.metadata || null,
    };
    const [page] = await db.insert(pages).values(pageData).returning();
    return page;
  }

  async getPagesByDocument(documentId: string): Promise<Page[]> {
    return db
      .select()
      .from(pages)
      .where(eq(pages.documentId, documentId))
      .orderBy(pages.pageNumber);
  }

  async getPage(id: string): Promise<Page | undefined> {
    const [page] = await db.select().from(pages).where(eq(pages.id, id));
    return page;
  }

  // Quality Issues
  async createQualityIssue(insertIssue: InsertQualityIssue): Promise<QualityIssue> {
    const issueData = {
      ...insertIssue,
      pageNumbers: (insertIssue.pageNumbers as number[]) || null,
    };
    const [issue] = await db.insert(qualityIssues).values(issueData).returning();
    return issue;
  }

  async getIssuesByDocument(documentId: string): Promise<QualityIssue[]> {
    return db
      .select()
      .from(qualityIssues)
      .where(eq(qualityIssues.documentId, documentId))
      .orderBy(desc(qualityIssues.createdAt));
  }

  // Summary
  async getDocumentSummary(documentId: string): Promise<DocumentSummary | undefined> {
    const doc = await this.getDocument(documentId);
    if (!doc) return undefined;

    const docPages = await this.getPagesByDocument(documentId);
    const issues = await this.getIssuesByDocument(documentId);

    const classificationBreakdown: Record<string, number> = {};
    let totalConfidence = 0;

    docPages.forEach(page => {
      classificationBreakdown[page.classification] = 
        (classificationBreakdown[page.classification] || 0) + 1;
      totalConfidence += page.confidence;
    });

    return {
      document: doc,
      pageCount: docPages.length,
      classificationBreakdown,
      issueCount: issues.length,
      avgConfidence: docPages.length > 0 ? Math.round(totalConfidence / docPages.length) : 0,
    };
  }
}

export const dbStorage = new DBStorage();
