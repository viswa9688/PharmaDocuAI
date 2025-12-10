import { db } from "./db";
import { 
  documents, 
  pages, 
  qualityIssues,
  issueResolutions,
  users,
  processingEvents,
  type Document,
  type InsertDocument,
  type Page,
  type InsertPage,
  type QualityIssue,
  type InsertQualityIssue,
  type IssueResolution,
  type InsertIssueResolution,
  type DocumentSummary,
  type User,
  type UpsertUser,
  type ProcessingEvent,
  type InsertProcessingEvent,
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import type { IStorage } from "./storage";

export class DBStorage implements IStorage {
  // Documents
  async createDocument(insertDoc: InsertDocument, uploadedBy?: string | null): Promise<Document> {
    const docData = {
      ...insertDoc,
      uploadedBy: uploadedBy || null,
    };
    const [doc] = await db.insert(documents).values(docData).returning();
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

  // User operations (required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // First try to find existing user by ID
    const [existingById] = await db
      .select()
      .from(users)
      .where(eq(users.id, userData.id!));
    
    if (existingById) {
      // User exists with this ID - update
      const [updated] = await db
        .update(users)
        .set({
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userData.id!))
        .returning();
      return updated;
    }
    
    // Check if email exists with different ID - clear that email first
    if (userData.email) {
      await db
        .update(users)
        .set({ email: null })
        .where(eq(users.email, userData.email));
    }
    
    // Insert new user
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
    return user;
  }

  // Processing Events (Audit Trail)
  async createProcessingEvent(event: InsertProcessingEvent): Promise<ProcessingEvent> {
    const [created] = await db.insert(processingEvents).values(event).returning();
    return created;
  }

  async getEventsByDocument(documentId: string): Promise<ProcessingEvent[]> {
    return db
      .select()
      .from(processingEvents)
      .where(eq(processingEvents.documentId, documentId))
      .orderBy(desc(processingEvents.createdAt));
  }

  async getEventsByPage(pageId: string): Promise<ProcessingEvent[]> {
    return db
      .select()
      .from(processingEvents)
      .where(eq(processingEvents.pageId, pageId))
      .orderBy(desc(processingEvents.createdAt));
  }

  async getRecentEvents(limit: number = 100): Promise<ProcessingEvent[]> {
    return db
      .select()
      .from(processingEvents)
      .orderBy(desc(processingEvents.createdAt))
      .limit(limit);
  }

  async getFailedEvents(): Promise<ProcessingEvent[]> {
    return db
      .select()
      .from(processingEvents)
      .where(eq(processingEvents.status, "failed"))
      .orderBy(desc(processingEvents.createdAt));
  }

  // Issue Resolution operations
  async getQualityIssue(id: string): Promise<QualityIssue | undefined> {
    const [issue] = await db.select().from(qualityIssues).where(eq(qualityIssues.id, id));
    return issue;
  }

  async updateQualityIssue(id: string, updates: Partial<QualityIssue>): Promise<QualityIssue | undefined> {
    const [updated] = await db
      .update(qualityIssues)
      .set(updates)
      .where(eq(qualityIssues.id, id))
      .returning();
    return updated;
  }

  async deleteIssuesByDocument(documentId: string): Promise<number> {
    // First delete associated resolutions
    await db
      .delete(issueResolutions)
      .where(eq(issueResolutions.documentId, documentId));
    
    // Then delete the issues
    const result = await db
      .delete(qualityIssues)
      .where(eq(qualityIssues.documentId, documentId))
      .returning();
    
    return result.length;
  }

  async createIssueResolution(resolution: InsertIssueResolution): Promise<IssueResolution> {
    const [created] = await db.insert(issueResolutions).values(resolution).returning();
    return created;
  }

  async getIssueResolutions(issueId: string): Promise<IssueResolution[]> {
    return db
      .select()
      .from(issueResolutions)
      .where(eq(issueResolutions.issueId, issueId))
      .orderBy(desc(issueResolutions.createdAt));
  }

  async getDocumentIssueResolutions(documentId: string): Promise<IssueResolution[]> {
    return db
      .select()
      .from(issueResolutions)
      .where(eq(issueResolutions.documentId, documentId))
      .orderBy(desc(issueResolutions.createdAt));
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
}

export const dbStorage = new DBStorage();
