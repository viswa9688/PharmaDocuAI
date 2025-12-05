import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  "custom"
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
  "sop_violation"
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

// Document summary type
export type DocumentSummary = {
  document: Document;
  pageCount: number;
  classificationBreakdown: Record<string, number>;
  issueCount: number;
  avgConfidence: number;
};
