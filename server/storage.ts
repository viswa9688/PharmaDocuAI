import type { 
  Document, 
  InsertDocument, 
  Page, 
  InsertPage,
  QualityIssue,
  InsertQualityIssue,
  DocumentSummary,
  BMRVerification,
  InsertBMRVerification,
  BMRDiscrepancy,
  InsertBMRDiscrepancy,
  RawMaterialLimit,
  InsertRawMaterialLimit,
  RawMaterialVerification,
  InsertRawMaterialVerification,
  RawMaterialResult,
  InsertRawMaterialResult,
  BatchAllocationVerification,
  InsertBatchAllocationVerification
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Documents
  createDocument(doc: InsertDocument): Promise<Document>;
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

  // Summary
  getDocumentSummary(documentId: string): Promise<DocumentSummary | undefined>;

  // BMR Verifications
  createBMRVerification(verification: InsertBMRVerification): Promise<BMRVerification>;
  getBMRVerification(id: string): Promise<BMRVerification | undefined>;
  getAllBMRVerifications(): Promise<BMRVerification[]>;
  updateBMRVerification(id: string, updates: Partial<BMRVerification>): Promise<BMRVerification | undefined>;
  deleteBMRVerification(id: string): Promise<boolean>;

  // BMR Discrepancies
  createBMRDiscrepancy(discrepancy: InsertBMRDiscrepancy): Promise<BMRDiscrepancy>;
  getDiscrepanciesByVerification(verificationId: string): Promise<BMRDiscrepancy[]>;

  // Raw Material Limits
  createRawMaterialLimit(limit: InsertRawMaterialLimit): Promise<RawMaterialLimit>;
  createRawMaterialLimits(limits: InsertRawMaterialLimit[]): Promise<RawMaterialLimit[]>;
  getRawMaterialLimit(id: string): Promise<RawMaterialLimit | undefined>;
  getRawMaterialLimitsByMpc(mpcNumber: string): Promise<RawMaterialLimit[]>;
  getAllRawMaterialLimits(): Promise<RawMaterialLimit[]>;
  deleteRawMaterialLimitsByMpc(mpcNumber: string): Promise<boolean>;

  // Raw Material Verifications
  createRawMaterialVerification(verification: InsertRawMaterialVerification): Promise<RawMaterialVerification>;
  getRawMaterialVerification(id: string): Promise<RawMaterialVerification | undefined>;
  getAllRawMaterialVerifications(): Promise<RawMaterialVerification[]>;
  updateRawMaterialVerification(id: string, updates: Partial<RawMaterialVerification>): Promise<RawMaterialVerification | undefined>;
  deleteRawMaterialVerification(id: string): Promise<boolean>;

  // Raw Material Results
  createRawMaterialResult(result: InsertRawMaterialResult): Promise<RawMaterialResult>;
  createRawMaterialResults(results: InsertRawMaterialResult[]): Promise<RawMaterialResult[]>;
  getRawMaterialResultsByVerification(verificationId: string): Promise<RawMaterialResult[]>;

  // Batch Allocation Verifications
  createBatchAllocationVerification(verification: InsertBatchAllocationVerification): Promise<BatchAllocationVerification>;
  getBatchAllocationVerification(id: string): Promise<BatchAllocationVerification | undefined>;
  getAllBatchAllocationVerifications(): Promise<BatchAllocationVerification[]>;
  updateBatchAllocationVerification(id: string, updates: Partial<BatchAllocationVerification>): Promise<BatchAllocationVerification | undefined>;
  deleteBatchAllocationVerification(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private documents: Map<string, Document>;
  private pages: Map<string, Page>;
  private qualityIssues: Map<string, QualityIssue>;
  private bmrVerifications: Map<string, BMRVerification>;
  private bmrDiscrepancies: Map<string, BMRDiscrepancy>;
  private rawMaterialLimitsMap: Map<string, RawMaterialLimit>;
  private rawMaterialVerificationsMap: Map<string, RawMaterialVerification>;
  private rawMaterialResultsMap: Map<string, RawMaterialResult>;
  private batchAllocationVerificationsMap: Map<string, BatchAllocationVerification>;

  constructor() {
    this.documents = new Map();
    this.pages = new Map();
    this.qualityIssues = new Map();
    this.bmrVerifications = new Map();
    this.bmrDiscrepancies = new Map();
    this.rawMaterialLimitsMap = new Map();
    this.rawMaterialVerificationsMap = new Map();
    this.rawMaterialResultsMap = new Map();
    this.batchAllocationVerificationsMap = new Map();
  }

  // Documents
  async createDocument(insertDoc: InsertDocument): Promise<Document> {
    const id = randomUUID();
    const doc: Document = {
      ...insertDoc,
      id,
      uploadedAt: new Date(),
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
      imagePath: insertPage.imagePath || null,
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

  // BMR Verifications
  async createBMRVerification(insertVerification: InsertBMRVerification): Promise<BMRVerification> {
    const id = randomUUID();
    const verification: BMRVerification = {
      ...insertVerification,
      id,
      status: insertVerification.status || "pending",
      uploadedAt: new Date(),
      completedAt: null,
      totalDiscrepancies: 0,
      masterProductCardPage: insertVerification.masterProductCardPage || null,
      bmrPage: insertVerification.bmrPage || null,
      errorMessage: null,
      extractedMpcData: null,
      extractedBmrData: null,
    };
    this.bmrVerifications.set(id, verification);
    return verification;
  }

  async getBMRVerification(id: string): Promise<BMRVerification | undefined> {
    return this.bmrVerifications.get(id);
  }

  async getAllBMRVerifications(): Promise<BMRVerification[]> {
    return Array.from(this.bmrVerifications.values()).sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  }

  async updateBMRVerification(id: string, updates: Partial<BMRVerification>): Promise<BMRVerification | undefined> {
    const verification = this.bmrVerifications.get(id);
    if (!verification) return undefined;

    const updated = { ...verification, ...updates };
    this.bmrVerifications.set(id, updated);
    return updated;
  }

  async deleteBMRVerification(id: string): Promise<boolean> {
    const discrepancies = await this.getDiscrepanciesByVerification(id);
    discrepancies.forEach(d => this.bmrDiscrepancies.delete(d.id));
    return this.bmrVerifications.delete(id);
  }

  // BMR Discrepancies
  async createBMRDiscrepancy(insertDiscrepancy: InsertBMRDiscrepancy): Promise<BMRDiscrepancy> {
    const id = randomUUID();
    const discrepancy: BMRDiscrepancy = {
      ...insertDiscrepancy,
      id,
      mpcValue: insertDiscrepancy.mpcValue || null,
      bmrValue: insertDiscrepancy.bmrValue || null,
      section: insertDiscrepancy.section || null,
      createdAt: new Date(),
    };
    this.bmrDiscrepancies.set(id, discrepancy);
    return discrepancy;
  }

  async getDiscrepanciesByVerification(verificationId: string): Promise<BMRDiscrepancy[]> {
    return Array.from(this.bmrDiscrepancies.values())
      .filter(d => d.verificationId === verificationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  // Raw Material Limits
  async createRawMaterialLimit(insertLimit: InsertRawMaterialLimit): Promise<RawMaterialLimit> {
    const id = randomUUID();
    const limit: RawMaterialLimit = {
      ...insertLimit,
      id,
      bomQuantityValue: insertLimit.bomQuantityValue || null,
      bomQuantityUnit: insertLimit.bomQuantityUnit || null,
      tolerancePercent: insertLimit.tolerancePercent || null,
      toleranceMin: insertLimit.toleranceMin || null,
      toleranceMax: insertLimit.toleranceMax || null,
      toleranceDisplay: insertLimit.toleranceDisplay || null,
      criticality: insertLimit.criticality || "non-critical",
      approvedVendor: insertLimit.approvedVendor || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.rawMaterialLimitsMap.set(id, limit);
    return limit;
  }

  async createRawMaterialLimits(insertLimits: InsertRawMaterialLimit[]): Promise<RawMaterialLimit[]> {
    const results: RawMaterialLimit[] = [];
    for (const insertLimit of insertLimits) {
      results.push(await this.createRawMaterialLimit(insertLimit));
    }
    return results;
  }

  async getRawMaterialLimit(id: string): Promise<RawMaterialLimit | undefined> {
    return this.rawMaterialLimitsMap.get(id);
  }

  async getRawMaterialLimitsByMpc(mpcNumber: string): Promise<RawMaterialLimit[]> {
    return Array.from(this.rawMaterialLimitsMap.values())
      .filter(l => l.mpcNumber === mpcNumber)
      .sort((a, b) => a.materialCode.localeCompare(b.materialCode));
  }

  async getAllRawMaterialLimits(): Promise<RawMaterialLimit[]> {
    return Array.from(this.rawMaterialLimitsMap.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async deleteRawMaterialLimitsByMpc(mpcNumber: string): Promise<boolean> {
    const limits = await this.getRawMaterialLimitsByMpc(mpcNumber);
    limits.forEach(l => this.rawMaterialLimitsMap.delete(l.id));
    return limits.length > 0;
  }

  // Raw Material Verifications
  async createRawMaterialVerification(insertVerification: InsertRawMaterialVerification): Promise<RawMaterialVerification> {
    const id = randomUUID();
    const verification: RawMaterialVerification = {
      ...insertVerification,
      id,
      bmrNumber: insertVerification.bmrNumber || null,
      status: insertVerification.status || "pending",
      uploadedAt: new Date(),
      completedAt: null,
      totalMaterials: 0,
      materialsWithinLimits: 0,
      materialsOutOfLimits: 0,
      errorMessage: null,
    };
    this.rawMaterialVerificationsMap.set(id, verification);
    return verification;
  }

  async getRawMaterialVerification(id: string): Promise<RawMaterialVerification | undefined> {
    return this.rawMaterialVerificationsMap.get(id);
  }

  async getAllRawMaterialVerifications(): Promise<RawMaterialVerification[]> {
    return Array.from(this.rawMaterialVerificationsMap.values())
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }

  async updateRawMaterialVerification(id: string, updates: Partial<RawMaterialVerification>): Promise<RawMaterialVerification | undefined> {
    const verification = this.rawMaterialVerificationsMap.get(id);
    if (!verification) return undefined;
    const updated = { ...verification, ...updates };
    this.rawMaterialVerificationsMap.set(id, updated);
    return updated;
  }

  async deleteRawMaterialVerification(id: string): Promise<boolean> {
    const results = await this.getRawMaterialResultsByVerification(id);
    results.forEach(r => this.rawMaterialResultsMap.delete(r.id));
    return this.rawMaterialVerificationsMap.delete(id);
  }

  // Raw Material Results
  async createRawMaterialResult(insertResult: InsertRawMaterialResult): Promise<RawMaterialResult> {
    const id = randomUUID();
    const result: RawMaterialResult = {
      ...insertResult,
      id,
      limitId: insertResult.limitId || null,
      actualQuantity: insertResult.actualQuantity || null,
      actualQuantityValue: insertResult.actualQuantityValue || null,
      withinLimits: insertResult.withinLimits || null,
      toleranceDisplay: insertResult.toleranceDisplay || null,
      verifiedBy: insertResult.verifiedBy || null,
      approvedVendor: insertResult.approvedVendor || null,
      criticality: insertResult.criticality || null,
      deviationPercent: insertResult.deviationPercent || null,
      notes: insertResult.notes || null,
      createdAt: new Date(),
    };
    this.rawMaterialResultsMap.set(id, result);
    return result;
  }

  async createRawMaterialResults(insertResults: InsertRawMaterialResult[]): Promise<RawMaterialResult[]> {
    const results: RawMaterialResult[] = [];
    for (const insertResult of insertResults) {
      results.push(await this.createRawMaterialResult(insertResult));
    }
    return results;
  }

  async getRawMaterialResultsByVerification(verificationId: string): Promise<RawMaterialResult[]> {
    return Array.from(this.rawMaterialResultsMap.values())
      .filter(r => r.verificationId === verificationId)
      .sort((a, b) => a.materialCode.localeCompare(b.materialCode));
  }

  // Batch Allocation Verifications
  async createBatchAllocationVerification(insertVerification: InsertBatchAllocationVerification): Promise<BatchAllocationVerification> {
    const id = randomUUID();
    const verification: BatchAllocationVerification = {
      ...insertVerification,
      id,
      uploadedAt: new Date(),
      completedAt: null,
      batchNumber: insertVerification.batchNumber || null,
      mpcNumber: insertVerification.mpcNumber || null,
      bmrNumber: insertVerification.bmrNumber || null,
      manufacturingDate: insertVerification.manufacturingDate || null,
      expiryDate: insertVerification.expiryDate || null,
      shelfLifeMonths: insertVerification.shelfLifeMonths || null,
      shelfLifeCalculated: insertVerification.shelfLifeCalculated || null,
      isCompliant: insertVerification.isCompliant || null,
      datesMatch: insertVerification.datesMatch || null,
      qaOfficer: insertVerification.qaOfficer || null,
      verificationDate: insertVerification.verificationDate || null,
      extractedData: null,
      errorMessage: null,
    };
    this.batchAllocationVerificationsMap.set(id, verification);
    return verification;
  }

  async getBatchAllocationVerification(id: string): Promise<BatchAllocationVerification | undefined> {
    return this.batchAllocationVerificationsMap.get(id);
  }

  async getAllBatchAllocationVerifications(): Promise<BatchAllocationVerification[]> {
    return Array.from(this.batchAllocationVerificationsMap.values())
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }

  async updateBatchAllocationVerification(id: string, updates: Partial<BatchAllocationVerification>): Promise<BatchAllocationVerification | undefined> {
    const verification = this.batchAllocationVerificationsMap.get(id);
    if (!verification) return undefined;
    const updated = { ...verification, ...updates };
    this.batchAllocationVerificationsMap.set(id, updated);
    return updated;
  }

  async deleteBatchAllocationVerification(id: string): Promise<boolean> {
    return this.batchAllocationVerificationsMap.delete(id);
  }
}

export const storage = new MemStorage();
export const memStorage = storage;
