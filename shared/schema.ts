import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==========================================
// AUTH TABLES (Required for Replit Auth)
// ==========================================

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// ==========================================
// AUDIT TRAIL - Processing Events
// ==========================================

// Event types for processing audit trail
export const processingEventTypes = [
  "document_upload",
  "document_delete",
  "image_conversion",
  "document_ai_extraction",
  "page_classification",
  "validation",
  "signature_analysis",
  "visual_analysis",
  "processing_complete",
  "processing_failed",
  "document_viewed",
  "alert_acknowledged",
  "document_approved",
  "document_unapproved",
  "issue_approved",
  "issue_rejected",
] as const;

export type ProcessingEventType = typeof processingEventTypes[number];

// Batch date bounds extracted from batch details page
export type BatchDateBounds = {
  commencementDate: string | null;       // Date of batch commencement (DD/MM/YY format)
  commencementTime: string | null;       // Time of batch commencement (HH:MM format)
  completionDate: string | null;         // Date of batch completion
  completionTime: string | null;         // Time of batch completion
  commencementTimestamp: string | null;  // ISO timestamp combining date + time
  completionTimestamp: string | null;    // ISO timestamp combining date + time
  extractionConfidence: "high" | "medium" | "low";  // Confidence based on parallel extraction reconciliation
  sourcePageNumber: number | null;       // Page number where batch details were found
};

// Document table - stores uploaded batch record PDFs
export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  fileSize: integer("file_size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  uploadedBy: varchar("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  totalPages: integer("total_pages"),
  processedPages: integer("processed_pages").default(0),
  errorMessage: text("error_message"),
  // Document type for workflow categorization
  documentType: text("document_type").default("batch_record"), // batch_record, bmr_verification, raw_material, batch_allocation
  // Batch date bounds for temporal validation
  batchDateBounds: jsonb("batch_date_bounds").$type<BatchDateBounds>(),
  // Approval status for batch records
  isApproved: boolean("is_approved").default(false).notNull(),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
});

// Processing events table for audit trail
export const processingEvents = pgTable("processing_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").references(() => documents.id, { onDelete: "cascade" }),
  pageId: varchar("page_id").references(() => pages.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  status: text("status").notNull().default("pending"), // pending, success, failed
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProcessingEventSchema = createInsertSchema(processingEvents).omit({
  id: true,
  createdAt: true,
});

export type ProcessingEvent = typeof processingEvents.$inferSelect;
export type InsertProcessingEvent = z.infer<typeof insertProcessingEventSchema>;

// Page classifications
export const pageTypes = [
  "materials_log",
  "equipment_log",
  "cip_sip_record",
  "filtration_step",
  "filling_log",
  "inspection_sheet",
  "reconciliation_page",
  "unknown"
] as const;

export type PageType = typeof pageTypes[number];

// Pages table - stores individual pages from documents
export const pages = pgTable("pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  classification: text("classification").notNull(),
  confidence: integer("confidence").notNull(), // 0-100
  extractedText: text("extracted_text"),
  imagePath: text("image_path"), // Path to extracted page image
  issues: jsonb("issues").$type<string[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Issue resolution status enum
export const issueResolutionStatuses = ["pending", "approved", "rejected"] as const;
export type IssueResolutionStatus = typeof issueResolutionStatuses[number];

// Issue location for highlighting on page images
export type IssueLocation = {
  pageNumber: number;
  xPct: number;      // X position as percentage of page width (0-100)
  yPct: number;      // Y position as percentage of page height (0-100)
  widthPct: number;  // Width as percentage of page width
  heightPct: number; // Height as percentage of page height
};

// Quality control issues
export const qualityIssues = pgTable("quality_issues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  issueType: text("issue_type").notNull(), // missing, duplicate, out_of_order, corrupted
  severity: text("severity").notNull(), // low, medium, high
  description: text("description").notNull(),
  pageNumbers: jsonb("page_numbers").$type<number[]>().default([]),
  locations: jsonb("locations").$type<IssueLocation[]>().default([]), // Bounding box locations for highlighting
  resolved: boolean("resolved").default(false),
  resolutionStatus: text("resolution_status").default("pending").notNull(), // pending, approved, rejected
  resolvedBy: varchar("resolved_by").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  resolutionComment: text("resolution_comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Issue resolutions history table - tracks all resolution actions with mandatory comments
export const issueResolutions = pgTable("issue_resolutions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  issueId: varchar("issue_id").notNull().references(() => qualityIssues.id, { onDelete: "cascade" }),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  resolverId: varchar("resolver_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // approved, rejected
  comment: text("comment").notNull(), // Mandatory comment for every resolution
  previousStatus: text("previous_status"), // What status the issue was before this action
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertIssueResolutionSchema = createInsertSchema(issueResolutions).omit({
  id: true,
  createdAt: true,
});

export type IssueResolution = typeof issueResolutions.$inferSelect;
export type InsertIssueResolution = z.infer<typeof insertIssueResolutionSchema>;

// Insert schemas
export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadedAt: true,
  uploadedBy: true,
  totalPages: true,
  processedPages: true,
  errorMessage: true,
  isApproved: true,
  approvedBy: true,
  approvedAt: true,
});

export const insertPageSchema = createInsertSchema(pages).omit({
  id: true,
  createdAt: true,
});

export const insertQualityIssueSchema = createInsertSchema(qualityIssues).omit({
  id: true,
  createdAt: true,
});

// Types
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Page = typeof pages.$inferSelect;
export type InsertPage = z.infer<typeof insertPageSchema>;
export type QualityIssue = typeof qualityIssues.$inferSelect;
export type InsertQualityIssue = z.infer<typeof insertQualityIssueSchema>;

// Processing job status type (for frontend state management)
export type ProcessingStatus = {
  documentId: string;
  status: "pending" | "processing" | "completed" | "failed";
  currentPage: number;
  totalPages: number;
  message: string;
};

// ==========================================
// VALIDATION ENGINE TYPES
// ==========================================

// Bounding box for source location tracking
export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// Source location for tracking where a value came from
export type SourceLocation = {
  pageNumber: number;
  sectionType: string;
  fieldLabel: string;
  boundingBox: BoundingBox;
  surroundingContext: string;
};

// Normalized extracted value with full metadata
export type ExtractedValue = {
  id: string;
  rawValue: string;
  numericValue: number | null;
  unit: string | null;
  valueType: "numeric" | "date" | "time" | "datetime" | "text" | "boolean";
  source: SourceLocation;
  confidence: number;
  isHandwritten: boolean;
};

// Formula types supported by the validation engine
export const formulaTypes = [
  "yield_percentage",
  "material_reconciliation", 
  "hold_time",
  "temperature_average",
  "flow_volume",
  "pressure_differential",
  "filter_integrity",
  "concentration",
  "weight_difference",
  "time_duration",
  "custom",
  "dynamic_formula",      // Formulas detected dynamically from page text
  "assay_calculation",    // (100-LOD)×Value/100 pattern
  "potency_calculation",  // A×Factor×1000/100 pattern
  "lod_adjusted"          // Any LOD-adjusted calculation
] as const;

export type FormulaType = typeof formulaTypes[number];

// Detected formula with operands and calculation
export type DetectedFormula = {
  id: string;
  formulaType: FormulaType;
  formulaExpression: string;
  operands: {
    name: string;
    value: ExtractedValue;
    role: "numerator" | "denominator" | "addend" | "subtrahend" | "multiplier" | "divisor" | "base" | "operand";
  }[];
  expectedResult: number;
  actualResult: ExtractedValue | null;
  discrepancy: number | null;
  tolerancePercent: number;
  isWithinTolerance: boolean;
  source: SourceLocation;
};

// Validation alert severity levels
export const alertSeverities = ["critical", "high", "medium", "low", "info"] as const;
export type AlertSeverity = typeof alertSeverities[number];

// Validation alert categories
export const alertCategories = [
  "calculation_error",
  "missing_value",
  "range_violation",
  "sequence_error",
  "unit_mismatch",
  "trend_anomaly",
  "consistency_error",
  "format_error",
  "sop_violation",
  "data_quality",
  "data_integrity"  // For strike-offs, corrections, erasures, overwrites
] as const;

export type AlertCategory = typeof alertCategories[number];

// Validation alert with human-readable details
export type ValidationAlert = {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  message: string;
  details: string;
  source: SourceLocation;
  relatedValues: ExtractedValue[];
  suggestedAction: string;
  ruleId: string | null;
  formulaId: string | null;
  isResolved: boolean;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolution: string | null;
};

// SOP Rule definition for configurable validation
export type SOPRule = {
  id: string;
  name: string;
  description: string;
  category: AlertCategory;
  severity: AlertSeverity;
  enabled: boolean;
  conditions: {
    fieldPattern: string;
    sectionTypes: string[];
    operator: "equals" | "not_equals" | "greater_than" | "less_than" | "between" | "contains" | "matches" | "exists" | "not_exists";
    value: number | string | boolean | [number, number];
    unit?: string;
  }[];
  errorMessage: string;
  suggestedAction: string;
};

// Validation result for a single page
export type PageValidationResult = {
  pageNumber: number;
  extractedValues: ExtractedValue[];
  detectedFormulas: DetectedFormula[];
  alerts: ValidationAlert[];
  validationTimestamp: Date;
  extractedText?: string;
};

// Document-level validation summary
export type DocumentValidationSummary = {
  documentId: string;
  totalPages: number;
  pagesValidated: number;
  totalAlerts: number;
  alertsBySeverity: Record<AlertSeverity, number>;
  alertsByCategory: Record<AlertCategory, number>;
  formulasChecked: number;
  formulaDiscrepancies: number;
  crossPageIssues: ValidationAlert[];
  validationTimestamp: Date;
  isComplete: boolean;
};

// Classification result type
export type ClassificationResult = {
  pageNumber: number;
  classification: PageType;
  confidence: number;
  extractedText: string;
  issues: string[];
};

// ==========================================
// VISUAL ANOMALY DETECTION TYPES
// ==========================================

// Types of visual anomalies that can be detected
export const visualAnomalyTypes = [
  "strike_through",     // Horizontal or diagonal line through text
  "red_mark",           // Red pen corrections or marks
  "overwrite",          // Multiple overlapping text/values
  "erasure",            // Signs of erasure (whitened areas, rubbed out text)
  "correction_fluid",   // White-out or correction tape marks
  "scribble"            // Heavy scribbling over text
] as const;

export type VisualAnomalyType = typeof visualAnomalyTypes[number];

// A detected visual anomaly on a page
export type VisualAnomaly = {
  id: string;
  type: VisualAnomalyType;
  confidence: number;                // 0-100 detection confidence
  pageNumber: number;
  boundingBox: BoundingBox;          // Where the anomaly was detected
  affectedTextRegion: BoundingBox | null;  // The text region affected (if applicable)
  affectedText: string | null;       // The text that appears to be affected
  thumbnailPath: string | null;      // Path to cropped thumbnail of the anomaly
  severity: AlertSeverity;           // Severity based on GMP implications
  description: string;               // Human-readable description
  detectionMethod: string;           // How it was detected (line_detection, color_mask, etc.)
};

// Result from visual analysis of a page
export type VisualAnalysisResult = {
  pageNumber: number;
  imagePath: string;
  anomalies: VisualAnomaly[];
  analysisTimestamp: Date;
  processingTimeMs: number;
};

// Document summary type
export type DocumentSummary = {
  document: Document;
  pageCount: number;
  classificationBreakdown: Record<string, number>;
  issueCount: number;
  avgConfidence: number;
};

// ==========================================
// BMR VERIFICATION TYPES
// ==========================================

// Status of BMR verification
export const bmrVerificationStatuses = ["pending", "processing", "completed", "failed"] as const;
export type BMRVerificationStatus = typeof bmrVerificationStatuses[number];

// Discrepancy severity levels
export const discrepancySeverities = ["critical", "major", "minor"] as const;
export type DiscrepancySeverity = typeof discrepancySeverities[number];

// BMR Verification sessions table
export const bmrVerifications = pgTable("bmr_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  fileSize: integer("file_size").notNull(),
  status: text("status").notNull().default("pending"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  totalDiscrepancies: integer("total_discrepancies").default(0),
  masterProductCardPage: integer("master_product_card_page"),
  bmrPage: integer("bmr_page"),
  errorMessage: text("error_message"),
  extractedMpcData: jsonb("extracted_mpc_data").$type<Record<string, any>>(),
  extractedBmrData: jsonb("extracted_bmr_data").$type<Record<string, any>>(),
});

// Individual discrepancies found during verification
export const bmrDiscrepancies = pgTable("bmr_discrepancies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  verificationId: varchar("verification_id").notNull().references(() => bmrVerifications.id, { onDelete: "cascade" }),
  fieldName: text("field_name").notNull(),
  mpcValue: text("mpc_value"),
  bmrValue: text("bmr_value"),
  severity: text("severity").notNull(),
  description: text("description").notNull(),
  section: text("section"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas for BMR verification
export const insertBmrVerificationSchema = createInsertSchema(bmrVerifications).omit({
  id: true,
  uploadedAt: true,
  completedAt: true,
  totalDiscrepancies: true,
  errorMessage: true,
  extractedMpcData: true,
  extractedBmrData: true,
});

export const insertBmrDiscrepancySchema = createInsertSchema(bmrDiscrepancies).omit({
  id: true,
  createdAt: true,
});

// Types for BMR verification
export type BMRVerification = typeof bmrVerifications.$inferSelect;
export type InsertBMRVerification = z.infer<typeof insertBmrVerificationSchema>;
export type BMRDiscrepancy = typeof bmrDiscrepancies.$inferSelect;
export type InsertBMRDiscrepancy = z.infer<typeof insertBmrDiscrepancySchema>;

// Verification result summary for frontend
export type BMRVerificationResult = {
  verification: BMRVerification;
  discrepancies: BMRDiscrepancy[];
  matchedFields: string[];
  totalFieldsCompared: number;
};

// ==========================================
// RAW MATERIAL VERIFICATION TYPES
// ==========================================

// Criticality levels for raw materials
export const materialCriticalities = ["critical", "non-critical"] as const;
export type MaterialCriticality = typeof materialCriticalities[number];

// Raw Material BoM (Bill of Materials) limits table - stores approved limits from Master Product Card
export const rawMaterialLimits = pgTable("raw_material_limits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mpcNumber: text("mpc_number").notNull(),  // Master Product Card number (e.g., MPC-2024-003)
  materialCode: text("material_code").notNull(),  // e.g., RM-001
  materialName: text("material_name").notNull(),  // e.g., API XYZ 50 mg
  bomQuantity: text("bom_quantity").notNull(),  // Standard quantity (e.g., "5.0 kg")
  bomQuantityValue: integer("bom_quantity_value"),  // Numeric value in base unit (e.g., 5000 for 5.0 kg in grams)
  bomQuantityUnit: text("bom_quantity_unit"),  // Unit (e.g., "kg", "g", "mg")
  toleranceType: text("tolerance_type").notNull(),  // "percentage" or "fixed_range"
  tolerancePercent: integer("tolerance_percent"),  // e.g., 1 for ±1%, 2 for ±2%
  toleranceMin: integer("tolerance_min"),  // For fixed range: minimum in base unit
  toleranceMax: integer("tolerance_max"),  // For fixed range: maximum in base unit
  toleranceDisplay: text("tolerance_display"),  // Human-readable tolerance (e.g., "±1.0% (4.95 kg – 5.05 kg)")
  criticality: text("criticality").notNull().default("non-critical"),  // "critical" or "non-critical"
  approvedVendor: text("approved_vendor"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Raw Material Verification Sessions - stores verification instances
export const rawMaterialVerifications = pgTable("raw_material_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").references(() => documents.id, { onDelete: "cascade" }),
  mpcNumber: text("mpc_number").notNull(),
  bmrNumber: text("bmr_number"),  // Batch Manufacturing Record number
  filename: text("filename").notNull(),
  fileSize: integer("file_size").notNull(),
  status: text("status").notNull().default("pending"),  // pending, processing, completed, failed
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  totalMaterials: integer("total_materials").default(0),
  materialsWithinLimits: integer("materials_within_limits").default(0),
  materialsOutOfLimits: integer("materials_out_of_limits").default(0),
  errorMessage: text("error_message"),
});

// Individual raw material verification results
export const rawMaterialResults = pgTable("raw_material_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  verificationId: varchar("verification_id").notNull().references(() => rawMaterialVerifications.id, { onDelete: "cascade" }),
  limitId: varchar("limit_id").references(() => rawMaterialLimits.id),  // Reference to the BoM limit
  materialCode: text("material_code").notNull(),
  materialName: text("material_name").notNull(),
  bomQuantity: text("bom_quantity").notNull(),  // Expected from BoM
  actualQuantity: text("actual_quantity"),  // Actual from batch record
  actualQuantityValue: integer("actual_quantity_value"),  // Numeric value extracted
  withinLimits: boolean("within_limits"),  // true if within tolerance
  toleranceDisplay: text("tolerance_display"),  // e.g., "±2.0% (44.10 kg – 45.90 kg)"
  verifiedBy: text("verified_by"),  // Person who verified
  approvedVendor: boolean("approved_vendor"),  // Whether vendor is approved
  criticality: text("criticality"),  // "critical" or "non-critical"
  deviationPercent: integer("deviation_percent"),  // How much deviation from BoM (in basis points for precision)
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas for raw material tables
export const insertRawMaterialLimitSchema = createInsertSchema(rawMaterialLimits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRawMaterialVerificationSchema = createInsertSchema(rawMaterialVerifications).omit({
  id: true,
  uploadedAt: true,
  completedAt: true,
  totalMaterials: true,
  materialsWithinLimits: true,
  materialsOutOfLimits: true,
  errorMessage: true,
});

export const insertRawMaterialResultSchema = createInsertSchema(rawMaterialResults).omit({
  id: true,
  createdAt: true,
});

// Types for raw material verification
export type RawMaterialLimit = typeof rawMaterialLimits.$inferSelect;
export type InsertRawMaterialLimit = z.infer<typeof insertRawMaterialLimitSchema>;
export type RawMaterialVerification = typeof rawMaterialVerifications.$inferSelect;
export type InsertRawMaterialVerification = z.infer<typeof insertRawMaterialVerificationSchema>;
export type RawMaterialResult = typeof rawMaterialResults.$inferSelect;
export type InsertRawMaterialResult = z.infer<typeof insertRawMaterialResultSchema>;

// Verification result summary for frontend
export type RawMaterialVerificationResult = {
  verification: RawMaterialVerification;
  results: RawMaterialResult[];
  limits: RawMaterialLimit[];
};

// ==========================================
// BATCH ALLOCATION VERIFICATION TYPES
// ==========================================

// Batch Allocation Verification - validates Mfg/Exp dates and shelf life matching
export const batchAllocationVerifications = pgTable("batch_allocation_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").references(() => documents.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  fileSize: integer("file_size").notNull(),
  status: text("status").notNull().default("pending"),  // pending, processing, completed, failed
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  
  // Extracted data
  batchNumber: text("batch_number"),
  mpcNumber: text("mpc_number"),
  bmrNumber: text("bmr_number"),
  manufacturingDate: text("manufacturing_date"),
  expiryDate: text("expiry_date"),
  shelfLifeMonths: integer("shelf_life_months"),
  shelfLifeCalculated: integer("shelf_life_calculated"),  // Calculated from dates
  
  // Compliance status
  isCompliant: boolean("is_compliant"),  // From checkbox on document
  datesMatch: boolean("dates_match"),  // Mfg + shelf life = Exp
  
  // Verification details
  qaOfficer: text("qa_officer"),
  verificationDate: text("verification_date"),
  
  // Additional metadata
  extractedData: jsonb("extracted_data").$type<Record<string, any>>(),
  errorMessage: text("error_message"),
});

// Insert schema for batch allocation verification
export const insertBatchAllocationVerificationSchema = createInsertSchema(batchAllocationVerifications).omit({
  id: true,
  uploadedAt: true,
  completedAt: true,
  extractedData: true,
  errorMessage: true,
});

// Types for batch allocation verification
export type BatchAllocationVerification = typeof batchAllocationVerifications.$inferSelect;
export type InsertBatchAllocationVerification = z.infer<typeof insertBatchAllocationVerificationSchema>;
