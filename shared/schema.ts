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
