import { db } from "./db";
import { 
  documents, 
  pages, 
  qualityIssues,
  bmrVerifications,
  bmrDiscrepancies,
  rawMaterialLimits,
  rawMaterialVerifications,
  rawMaterialResults,
  batchAllocationVerifications,
  users,
  processingEvents,
  issueResolutions,
  type Document,
  type InsertDocument,
  type Page,
  type InsertPage,
  type QualityIssue,
  type InsertQualityIssue,
  type DocumentSummary,
  type BMRVerification,
  type InsertBMRVerification,
  type BMRDiscrepancy,
  type InsertBMRDiscrepancy,
  type RawMaterialLimit,
  type InsertRawMaterialLimit,
  type RawMaterialVerification,
  type InsertRawMaterialVerification,
  type RawMaterialResult,
  type InsertRawMaterialResult,
  type BatchAllocationVerification,
  type InsertBatchAllocationVerification,
  type User,
  type UpsertUser,
  type ProcessingEvent,
  type InsertProcessingEvent,
  type IssueResolution,
  type InsertIssueResolution,
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
    await db
      .delete(issueResolutions)
      .where(eq(issueResolutions.documentId, documentId));
    
    const result = await db
      .delete(qualityIssues)
      .where(eq(qualityIssues.documentId, documentId))
      .returning();
    
    return result.length;
  }

  // Issue Resolutions
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

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [existingById] = await db
      .select()
      .from(users)
      .where(eq(users.id, userData.id!));
    
    if (existingById) {
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
    
    if (userData.email) {
      await db
        .update(users)
        .set({ email: null })
        .where(eq(users.email, userData.email));
    }
    
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

  // BMR Verifications
  async createBMRVerification(insertVerification: InsertBMRVerification): Promise<BMRVerification> {
    const [verification] = await db.insert(bmrVerifications).values(insertVerification).returning();
    return verification;
  }

  async getBMRVerification(id: string): Promise<BMRVerification | undefined> {
    const [verification] = await db.select().from(bmrVerifications).where(eq(bmrVerifications.id, id));
    return verification;
  }

  async getAllBMRVerifications(): Promise<BMRVerification[]> {
    return db.select().from(bmrVerifications).orderBy(desc(bmrVerifications.uploadedAt));
  }

  async updateBMRVerification(id: string, updates: Partial<BMRVerification>): Promise<BMRVerification | undefined> {
    const [updated] = await db
      .update(bmrVerifications)
      .set(updates)
      .where(eq(bmrVerifications.id, id))
      .returning();
    return updated;
  }

  async deleteBMRVerification(id: string): Promise<boolean> {
    const result = await db.delete(bmrVerifications).where(eq(bmrVerifications.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // BMR Discrepancies
  async createBMRDiscrepancy(insertDiscrepancy: InsertBMRDiscrepancy): Promise<BMRDiscrepancy> {
    const discrepancyData = {
      ...insertDiscrepancy,
      mpcValue: insertDiscrepancy.mpcValue || null,
      bmrValue: insertDiscrepancy.bmrValue || null,
      section: insertDiscrepancy.section || null,
      mpcBoundingBox: insertDiscrepancy.mpcBoundingBox || null,
      bmrBoundingBox: insertDiscrepancy.bmrBoundingBox || null,
    };
    const [discrepancy] = await db.insert(bmrDiscrepancies).values(discrepancyData).returning();
    return discrepancy;
  }

  async getDiscrepanciesByVerification(verificationId: string): Promise<BMRDiscrepancy[]> {
    return db
      .select()
      .from(bmrDiscrepancies)
      .where(eq(bmrDiscrepancies.verificationId, verificationId))
      .orderBy(bmrDiscrepancies.createdAt);
  }

  // Raw Material Limits
  async createRawMaterialLimit(insertLimit: InsertRawMaterialLimit): Promise<RawMaterialLimit> {
    const [limit] = await db.insert(rawMaterialLimits).values(insertLimit).returning();
    return limit;
  }

  async createRawMaterialLimits(insertLimits: InsertRawMaterialLimit[]): Promise<RawMaterialLimit[]> {
    if (insertLimits.length === 0) return [];
    const limits = await db.insert(rawMaterialLimits).values(insertLimits).returning();
    return limits;
  }

  async getRawMaterialLimit(id: string): Promise<RawMaterialLimit | undefined> {
    const [limit] = await db.select().from(rawMaterialLimits).where(eq(rawMaterialLimits.id, id));
    return limit;
  }

  async getRawMaterialLimitsByMpc(mpcNumber: string): Promise<RawMaterialLimit[]> {
    return db
      .select()
      .from(rawMaterialLimits)
      .where(eq(rawMaterialLimits.mpcNumber, mpcNumber))
      .orderBy(rawMaterialLimits.materialCode);
  }

  async getAllRawMaterialLimits(): Promise<RawMaterialLimit[]> {
    return db.select().from(rawMaterialLimits).orderBy(desc(rawMaterialLimits.createdAt));
  }

  async deleteRawMaterialLimitsByMpc(mpcNumber: string): Promise<boolean> {
    const result = await db.delete(rawMaterialLimits).where(eq(rawMaterialLimits.mpcNumber, mpcNumber));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Raw Material Verifications
  async createRawMaterialVerification(insertVerification: InsertRawMaterialVerification): Promise<RawMaterialVerification> {
    const [verification] = await db.insert(rawMaterialVerifications).values(insertVerification).returning();
    return verification;
  }

  async getRawMaterialVerification(id: string): Promise<RawMaterialVerification | undefined> {
    const [verification] = await db.select().from(rawMaterialVerifications).where(eq(rawMaterialVerifications.id, id));
    return verification;
  }

  async getAllRawMaterialVerifications(): Promise<RawMaterialVerification[]> {
    return db.select().from(rawMaterialVerifications).orderBy(desc(rawMaterialVerifications.uploadedAt));
  }

  async updateRawMaterialVerification(id: string, updates: Partial<RawMaterialVerification>): Promise<RawMaterialVerification | undefined> {
    const [updated] = await db
      .update(rawMaterialVerifications)
      .set(updates)
      .where(eq(rawMaterialVerifications.id, id))
      .returning();
    return updated;
  }

  async deleteRawMaterialVerification(id: string): Promise<boolean> {
    const result = await db.delete(rawMaterialVerifications).where(eq(rawMaterialVerifications.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Raw Material Results
  async createRawMaterialResult(insertResult: InsertRawMaterialResult): Promise<RawMaterialResult> {
    const [result] = await db.insert(rawMaterialResults).values(insertResult).returning();
    return result;
  }

  async createRawMaterialResults(insertResults: InsertRawMaterialResult[]): Promise<RawMaterialResult[]> {
    if (insertResults.length === 0) return [];
    const results = await db.insert(rawMaterialResults).values(insertResults).returning();
    return results;
  }

  async getRawMaterialResultsByVerification(verificationId: string): Promise<RawMaterialResult[]> {
    return db
      .select()
      .from(rawMaterialResults)
      .where(eq(rawMaterialResults.verificationId, verificationId))
      .orderBy(rawMaterialResults.materialCode);
  }

  // Batch Allocation Verifications
  async createBatchAllocationVerification(insertVerification: InsertBatchAllocationVerification): Promise<BatchAllocationVerification> {
    const [verification] = await db.insert(batchAllocationVerifications).values(insertVerification).returning();
    return verification;
  }

  async getBatchAllocationVerification(id: string): Promise<BatchAllocationVerification | undefined> {
    const [verification] = await db.select().from(batchAllocationVerifications).where(eq(batchAllocationVerifications.id, id));
    return verification;
  }

  async getAllBatchAllocationVerifications(): Promise<BatchAllocationVerification[]> {
    return db.select().from(batchAllocationVerifications).orderBy(desc(batchAllocationVerifications.uploadedAt));
  }

  async updateBatchAllocationVerification(id: string, updates: Partial<BatchAllocationVerification>): Promise<BatchAllocationVerification | undefined> {
    const [updated] = await db
      .update(batchAllocationVerifications)
      .set(updates)
      .where(eq(batchAllocationVerifications.id, id))
      .returning();
    return updated;
  }

  async deleteBatchAllocationVerification(id: string): Promise<boolean> {
    const result = await db.delete(batchAllocationVerifications).where(eq(batchAllocationVerifications.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }
}

export const dbStorage = new DBStorage();
