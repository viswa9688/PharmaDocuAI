import type { UserDeclaredFields, ValidationAlert, AlertSeverity, AlertCategory, SourceLocation } from "@shared/schema";

export interface ExtractedBatchFields {
  productName: string | null;
  batchNo: string | null;
  manufacturingDate: string | null;
  expiryDate: string | null;
  startDate: string | null;
  endDate: string | null;
}

function normalizeString(val: string | null | undefined): string {
  if (!val) return "";
  return val.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeDate(val: string | null | undefined): string {
  if (!val) return "";
  const cleaned = val.trim();
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/,
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
    /^(\d{2})-(\d{2})-(\d{4})$/,
    /^(\d{2})\.(\d{2})\.(\d{4})$/,
  ];
  for (const fmt of formats) {
    const m = cleaned.match(fmt);
    if (m) {
      if (m[1].length === 4) {
        return `${m[1]}-${m[2]}-${m[3]}`;
      }
      return `${m[3]}-${m[2]}-${m[1]}`;
    }
  }
  try {
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  } catch {}
  return cleaned.toLowerCase();
}

function stringsMatch(declared: string | null, extracted: string | null): boolean {
  const a = normalizeString(declared);
  const b = normalizeString(extracted);
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
}

function datesMatch(declared: string | null, extracted: string | null): boolean {
  const a = normalizeDate(declared);
  const b = normalizeDate(extracted);
  if (!a || !b) return true;
  return a === b;
}

export function extractBatchFieldsFromPages(
  pagesData: Array<{
    pageNumber: number;
    tables: any[];
    formFields: any[];
    rawText: string;
    classification?: string;
  }>
): ExtractedBatchFields {
  const result: ExtractedBatchFields = {
    productName: null,
    batchNo: null,
    manufacturingDate: null,
    expiryDate: null,
    startDate: null,
    endDate: null,
  };

  const bmrClassifications = ["batch_record", "master_product_card", "batch_details", "batch_allocation"];
  const sortedPages = [...pagesData].sort((a, b) => {
    const aIsBmr = bmrClassifications.includes(a.classification || "") ? 0 : 1;
    const bIsBmr = bmrClassifications.includes(b.classification || "") ? 0 : 1;
    return aIsBmr - bIsBmr;
  });

  for (const page of sortedPages) {
    const text = page.rawText || "";
    const textLower = text.toLowerCase();

    if (!result.productName) {
      const productPatterns = [
        /product\s*name\s*[:\-]?\s*(.+?)(?:\n|$)/i,
        /name\s*of\s*product\s*[:\-]?\s*(.+?)(?:\n|$)/i,
        /product\s*[:\-]\s*(.+?)(?:\n|$)/i,
      ];
      for (const pat of productPatterns) {
        const m = text.match(pat);
        if (m && m[1].trim().length > 2) {
          result.productName = m[1].trim();
          break;
        }
      }
    }

    if (!result.batchNo) {
      const batchPatterns = [
        /batch\s*(?:no|number|#)\s*[:\-]?\s*([A-Za-z0-9\-\/]+)/i,
        /b\.?\s*no\s*[:\-]?\s*([A-Za-z0-9\-\/]+)/i,
        /lot\s*(?:no|number)\s*[:\-]?\s*([A-Za-z0-9\-\/]+)/i,
      ];
      for (const pat of batchPatterns) {
        const m = text.match(pat);
        if (m && m[1].trim().length > 2) {
          result.batchNo = m[1].trim();
          break;
        }
      }
    }

    if (!result.manufacturingDate) {
      const mfgPatterns = [
        /(?:mfg|manufacturing|mfg\.)\s*date\s*[:\-]?\s*(\d[\d\/\-\.]+\d)/i,
        /date\s*of\s*(?:mfg|manufacturing)\s*[:\-]?\s*(\d[\d\/\-\.]+\d)/i,
      ];
      for (const pat of mfgPatterns) {
        const m = text.match(pat);
        if (m) {
          result.manufacturingDate = m[1].trim();
          break;
        }
      }
    }

    if (!result.expiryDate) {
      const expPatterns = [
        /(?:exp|expiry|expiration|exp\.)\s*date\s*[:\-]?\s*(\d[\d\/\-\.]+\d)/i,
        /date\s*of\s*(?:exp|expiry)\s*[:\-]?\s*(\d[\d\/\-\.]+\d)/i,
        /best\s*before\s*[:\-]?\s*(\d[\d\/\-\.]+\d)/i,
      ];
      for (const pat of expPatterns) {
        const m = text.match(pat);
        if (m) {
          result.expiryDate = m[1].trim();
          break;
        }
      }
    }

    if (!result.startDate) {
      const startPatterns = [
        /(?:start|commencement|commenced)\s*date\s*[:\-]?\s*(\d[\d\/\-\.]+\d)/i,
        /date\s*of\s*(?:start|commencement)\s*[:\-]?\s*(\d[\d\/\-\.]+\d)/i,
      ];
      for (const pat of startPatterns) {
        const m = text.match(pat);
        if (m) {
          result.startDate = m[1].trim();
          break;
        }
      }
    }

    if (!result.endDate) {
      const endPatterns = [
        /(?:end|completion|completed)\s*date\s*[:\-]?\s*(\d[\d\/\-\.]+\d)/i,
        /date\s*of\s*(?:end|completion)\s*[:\-]?\s*(\d[\d\/\-\.]+\d)/i,
      ];
      for (const pat of endPatterns) {
        const m = text.match(pat);
        if (m) {
          result.endDate = m[1].trim();
          break;
        }
      }
    }

    for (const field of (page.formFields || [])) {
      const name = (field.fieldName || field.name || "").toLowerCase();
      const value = (field.fieldValue || field.value || "").trim();
      if (!value) continue;

      if (!result.productName && (name.includes("product") && name.includes("name"))) {
        result.productName = value;
      }
      if (!result.batchNo && (name.includes("batch") && (name.includes("no") || name.includes("number")))) {
        result.batchNo = value;
      }
      if (!result.manufacturingDate && (name.includes("mfg") || name.includes("manufacturing")) && name.includes("date")) {
        result.manufacturingDate = value;
      }
      if (!result.expiryDate && (name.includes("exp") || name.includes("expiry")) && name.includes("date")) {
        result.expiryDate = value;
      }
    }

    for (const table of (page.tables || [])) {
      const rows = table.rows || table.data || [];
      for (const row of rows) {
        const cells = Array.isArray(row) ? row : (row.cells || []);
        for (let i = 0; i < cells.length - 1; i++) {
          const cellLabel = normalizeString(typeof cells[i] === "string" ? cells[i] : cells[i]?.text || cells[i]?.value || "");
          const cellValue = typeof cells[i + 1] === "string" ? cells[i + 1] : cells[i + 1]?.text || cells[i + 1]?.value || "";
          if (!cellValue) continue;

          if (!result.productName && cellLabel.includes("product") && cellLabel.includes("name")) {
            result.productName = cellValue.trim();
          }
          if (!result.batchNo && cellLabel.includes("batch") && (cellLabel.includes("no") || cellLabel.includes("number"))) {
            result.batchNo = cellValue.trim();
          }
          if (!result.manufacturingDate && (cellLabel.includes("mfg") || cellLabel.includes("manufacturing")) && cellLabel.includes("date")) {
            result.manufacturingDate = cellValue.trim();
          }
          if (!result.expiryDate && (cellLabel.includes("exp") || cellLabel.includes("expiry")) && cellLabel.includes("date")) {
            result.expiryDate = cellValue.trim();
          }
        }
      }
    }
  }

  return result;
}

export function compareUserDeclaredFields(
  declared: UserDeclaredFields,
  extracted: ExtractedBatchFields
): ValidationAlert[] {
  const alerts: ValidationAlert[] = [];
  const fieldChecks: Array<{
    declaredKey: keyof UserDeclaredFields;
    extractedKey: keyof ExtractedBatchFields;
    label: string;
    isDate: boolean;
  }> = [
    { declaredKey: "productName", extractedKey: "productName", label: "Product Name", isDate: false },
    { declaredKey: "batchNo", extractedKey: "batchNo", label: "Batch Number", isDate: false },
    { declaredKey: "startDate", extractedKey: "startDate", label: "Start Date", isDate: true },
    { declaredKey: "endDate", extractedKey: "endDate", label: "End Date", isDate: true },
    { declaredKey: "manufacturingDate", extractedKey: "manufacturingDate", label: "Manufacturing Date", isDate: true },
    { declaredKey: "expiryDate", extractedKey: "expiryDate", label: "Expiry Date", isDate: true },
  ];

  let counter = 0;
  function makeSource(fieldLabel: string): SourceLocation {
    return {
      pageNumber: 1,
      sectionType: "Batch Information",
      fieldLabel,
      boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      surroundingContext: "",
    };
  }

  for (const check of fieldChecks) {
    const declaredVal = declared[check.declaredKey];
    const extractedVal = extracted[check.extractedKey];

    if (!declaredVal || !declaredVal.trim()) continue;

    if (!extractedVal) {
      alerts.push({
        id: `user_declared_${check.declaredKey}_not_found_${++counter}_${Date.now()}`,
        category: "consistency_error" as AlertCategory,
        severity: "medium" as AlertSeverity,
        title: `${check.label} not found in document`,
        message: `User declared "${declaredVal}" but this field was not found in the batch record.`,
        details: `Declared: "${declaredVal}" | Extracted: Not found`,
        source: makeSource(check.label),
        relatedValues: [],
        suggestedAction: `Verify that the ${check.label} is present in the batch manufacturing record`,
        ruleId: "user_declared_verification",
        formulaId: null,
        isResolved: false,
        resolvedBy: null,
        resolvedAt: null,
        resolution: null,
      });
      continue;
    }

    const match = check.isDate
      ? datesMatch(declaredVal, extractedVal)
      : stringsMatch(declaredVal, extractedVal);

    if (!match) {
      alerts.push({
        id: `user_declared_${check.declaredKey}_mismatch_${++counter}_${Date.now()}`,
        category: "consistency_error" as AlertCategory,
        severity: "high" as AlertSeverity,
        title: `${check.label} mismatch`,
        message: `User declared "${declaredVal}" but document shows "${extractedVal}".`,
        details: `Declared: "${declaredVal}" | Extracted: "${extractedVal}"`,
        source: makeSource(check.label),
        relatedValues: [],
        suggestedAction: `Verify the correct ${check.label} — declared value does not match extracted value`,
        ruleId: "user_declared_verification",
        formulaId: null,
        isResolved: false,
        resolvedBy: null,
        resolvedAt: null,
        resolution: null,
      });
    }
  }

  return alerts;
}
