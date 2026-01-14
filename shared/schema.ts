import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  totalPages: integer("total_pages"),
  processedPages: integer("processed_pages").default(0),
  errorMessage: text("error_message"),
  // Batch date bounds for temporal validation
  batchDateBounds: jsonb("batch_date_bounds").$type<BatchDateBounds>(),
});

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

// Quality control issues
export const qualityIssues = pgTable("quality_issues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  issueType: text("issue_type").notNull(), // missing, duplicate, out_of_order, corrupted
  severity: text("severity").notNull(), // low, medium, high
  description: text("description").notNull(),
  pageNumbers: jsonb("page_numbers").$type<number[]>().default([]),
  resolved: boolean("resolved").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas
export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadedAt: true,
  totalPages: true,
  processedPages: true,
  errorMessage: true,
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
