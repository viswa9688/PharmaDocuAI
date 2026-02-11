import type { 
  QAChecklist, 
  QACheckItem, 
  QACheckItemStatus, 
  ValidationAlert, 
  AlertCategory,
  DocumentValidationSummary,
  PageValidationResult 
} from "@shared/schema";

export interface QAChecklistInput {
  documentId: string;
  validationSummary: DocumentValidationSummary | null;
  pageResults: PageValidationResult[];
  allAlerts: ValidationAlert[];
  hasBmrVerification: boolean;
  bmrDiscrepancyCount: number;
  hasRawMaterialVerification: boolean;
  rawMaterialOutOfLimits: number;
  hasBatchAllocation: boolean;
  batchAllocationValid: boolean;
  totalPages: number;
  hasSignatures: boolean;
  missingSignatureCount: number;
  hasUserDeclaredFields: boolean;
  userDeclaredMismatchCount: number;
}

const QA_CHECK_DEFINITIONS = [
  {
    id: "qa_01",
    checkNumber: 1,
    title: "BMR matches Master Product Card",
    description: "BMR (Manufacturing) is an accurate reproduction of current Master Product Card.",
    category: "discrepancies" as const,
    alertCategory: null as AlertCategory | null,
    getRelatedAlerts: (input: QAChecklistInput): ValidationAlert[] => {
      return input.allAlerts.filter(a => a.category === "consistency_error" || a.category === "data_quality");
    },
    evaluate: (input: QAChecklistInput): { status: QACheckItemStatus; count: number; details: string | null } => {
      if (!input.hasBmrVerification) {
        const discrepancyAlerts = input.allAlerts.filter(a => a.category === "consistency_error" || a.category === "data_quality");
        if (discrepancyAlerts.length > 0) {
          return { status: "fail", count: discrepancyAlerts.length, details: `${discrepancyAlerts.length} consistency issues detected` };
        }
        return { status: "pass", count: 0, details: "No BMR/MPC discrepancies detected" };
      }
      if (input.bmrDiscrepancyCount > 0) {
        return { status: "fail", count: input.bmrDiscrepancyCount, details: `${input.bmrDiscrepancyCount} discrepancies found between BMR and MPC` };
      }
      return { status: "pass", count: 0, details: "BMR matches Master Product Card" };
    }
  },
  {
    id: "qa_03",
    checkNumber: 2,
    title: "Raw materials per standard quantity",
    description: "All raw materials are used as per standard quantity (BoM).",
    category: "discrepancies" as const,
    alertCategory: "data_quality" as AlertCategory | null,
    getRelatedAlerts: (input: QAChecklistInput): ValidationAlert[] => {
      return input.allAlerts.filter(a => a.category === "range_violation" || a.category === "data_quality");
    },
    evaluate: (input: QAChecklistInput): { status: QACheckItemStatus; count: number; details: string | null } => {
      if (!input.hasRawMaterialVerification) {
        const rangeAlerts = input.allAlerts.filter(a => a.category === "range_violation");
        if (rangeAlerts.length > 0) {
          return { status: "fail", count: rangeAlerts.length, details: `${rangeAlerts.length} quantity range violations detected` };
        }
        return { status: "pass", count: 0, details: "No material quantity issues detected" };
      }
      if (input.rawMaterialOutOfLimits > 0) {
        return { status: "fail", count: input.rawMaterialOutOfLimits, details: `${input.rawMaterialOutOfLimits} materials outside approved limits` };
      }
      return { status: "pass", count: 0, details: "All materials within approved limits" };
    }
  },
  {
    id: "qa_04",
    checkNumber: 3,
    title: "Product name & Batch No. on all pages",
    description: "Correct product name and Batch No. mentioned on all the pages of documents.",
    category: "missing" as const,
    alertCategory: "missing_value" as AlertCategory | null,
    getRelatedAlerts: (input: QAChecklistInput): ValidationAlert[] => {
      return input.allAlerts.filter(a => 
        (a.category === "missing_value" || a.category === "consistency_error") &&
        (a.title.toLowerCase().includes("batch") || a.title.toLowerCase().includes("product name") || a.title.toLowerCase().includes("lot"))
      );
    },
    evaluate: (input: QAChecklistInput): { status: QACheckItemStatus; count: number; details: string | null } => {
      const batchAlerts = input.allAlerts.filter(a => 
        (a.category === "missing_value" || a.category === "consistency_error") &&
        (a.title.toLowerCase().includes("batch") || a.title.toLowerCase().includes("product name") || a.title.toLowerCase().includes("lot"))
      );
      if (batchAlerts.length > 0) {
        return { status: "fail", count: batchAlerts.length, details: `${batchAlerts.length} batch/product name issues found` };
      }
      return { status: "pass", count: 0, details: "Batch number consistent across pages" };
    }
  },
  {
    id: "qa_05",
    checkNumber: 4,
    title: "Number of pages tallying",
    description: "Number of pages is tallying with the specified numbers as issued.",
    category: "missing" as const,
    alertCategory: "missing_value" as AlertCategory | null,
    getRelatedAlerts: (input: QAChecklistInput): ValidationAlert[] => {
      return input.allAlerts.filter(a => 
        a.ruleId === "page_completeness_missing" || 
        a.title.toLowerCase().includes("missing page")
      );
    },
    evaluate: (input: QAChecklistInput): { status: QACheckItemStatus; count: number; details: string | null } => {
      const missingPageAlerts = input.allAlerts.filter(a => 
        a.ruleId === "page_completeness_missing" || 
        a.title.toLowerCase().includes("missing page")
      );
      if (missingPageAlerts.length > 0) {
        return { status: "fail", count: missingPageAlerts.length, details: "Document has missing pages" };
      }
      return { status: "pass", count: 0, details: `All ${input.totalPages} pages present` };
    }
  },
  {
    id: "qa_07",
    checkNumber: 5,
    title: "Mfg/Exp dates & shelf life correct",
    description: "Mfg. and Exp. date of product is correct and shelf life is matching with the Batch no. allocation log.",
    category: "violations" as const,
    alertCategory: "sequence_error" as AlertCategory | null,
    getRelatedAlerts: (input: QAChecklistInput): ValidationAlert[] => {
      return input.allAlerts.filter(a => 
        a.category === "sequence_error" || 
        (a.title.toLowerCase().includes("date") && (a.category === "missing_value" || a.category === "range_violation"))
      );
    },
    evaluate: (input: QAChecklistInput): { status: QACheckItemStatus; count: number; details: string | null } => {
      const dateAlerts = input.allAlerts.filter(a => 
        a.category === "sequence_error" || 
        (a.title.toLowerCase().includes("date") && (a.category === "missing_value" || a.category === "range_violation"))
      );
      if (!input.hasBatchAllocation && dateAlerts.length === 0) {
        return { status: "pass", count: 0, details: "No date sequence issues detected" };
      }
      if (!input.batchAllocationValid || dateAlerts.length > 0) {
        const total = dateAlerts.length + (input.hasBatchAllocation && !input.batchAllocationValid ? 1 : 0);
        return { status: "fail", count: total, details: `${total} date/shelf life issues found` };
      }
      return { status: "pass", count: 0, details: "Dates and shelf life verified" };
    }
  },
  {
    id: "qa_08",
    checkNumber: 6,
    title: "Process details with signatures & dates",
    description: "Manufacturing process details are recorded properly in the relevant pages with signature, date and time.",
    category: "missing" as const,
    alertCategory: "missing_value" as AlertCategory | null,
    getRelatedAlerts: (input: QAChecklistInput): ValidationAlert[] => {
      return input.allAlerts.filter(a => 
        a.title.toLowerCase().includes("signature") || a.title.toLowerCase().includes("missing sign")
      );
    },
    evaluate: (input: QAChecklistInput): { status: QACheckItemStatus; count: number; details: string | null } => {
      const sigAlerts = input.allAlerts.filter(a => 
        a.title.toLowerCase().includes("signature") || a.title.toLowerCase().includes("missing sign")
      );
      if (sigAlerts.length > 0) {
        return { status: "fail", count: sigAlerts.length, details: `${sigAlerts.length} missing signatures detected` };
      }
      if (input.missingSignatureCount > 0) {
        return { status: "fail", count: input.missingSignatureCount, details: `${input.missingSignatureCount} missing signatures` };
      }
      return { status: "pass", count: 0, details: "All required signatures present" };
    }
  },
  {
    id: "qa_10",
    checkNumber: 7,
    title: "In-process findings within limits",
    description: "All in-process findings are within the limit of the specified set parameters.",
    category: "calculations" as const,
    alertCategory: "calculation_error" as AlertCategory | null,
    getRelatedAlerts: (input: QAChecklistInput): ValidationAlert[] => {
      return input.allAlerts.filter(a => 
        a.category === "calculation_error" || a.category === "range_violation"
      );
    },
    evaluate: (input: QAChecklistInput): { status: QACheckItemStatus; count: number; details: string | null } => {
      const calcAlerts = input.allAlerts.filter(a => 
        a.category === "calculation_error" || a.category === "range_violation"
      );
      if (calcAlerts.length > 0) {
        return { status: "fail", count: calcAlerts.length, details: `${calcAlerts.length} calculation/range issues found` };
      }
      return { status: "pass", count: 0, details: "All calculations and parameters within limits" };
    }
  },
  {
    id: "qa_11",
    checkNumber: 8,
    title: "Overwrites corrected & signed per SOP",
    description: "Any overwriting in the document is corrected and signed as per SOP.",
    category: "integrity" as const,
    alertCategory: "data_integrity" as AlertCategory | null,
    getRelatedAlerts: (input: QAChecklistInput): ValidationAlert[] => {
      return input.allAlerts.filter(a => 
        a.category === "data_integrity" && 
        (a.title.toLowerCase().includes("overwrite") || a.title.toLowerCase().includes("strike"))
      );
    },
    evaluate: (input: QAChecklistInput): { status: QACheckItemStatus; count: number; details: string | null } => {
      const overwriteAlerts = input.allAlerts.filter(a => 
        a.category === "data_integrity" && 
        (a.title.toLowerCase().includes("overwrite") || a.title.toLowerCase().includes("strike"))
      );
      if (overwriteAlerts.length > 0) {
        return { status: "fail", count: overwriteAlerts.length, details: `${overwriteAlerts.length} overwrite/strike-through issues detected` };
      }
      return { status: "pass", count: 0, details: "No unauthorized overwrites detected" };
    }
  },
  {
    id: "qa_18",
    checkNumber: 9,
    title: "Corrections signed by concerned person",
    description: "Any corrections in the document are corrected and signed by concerned person.",
    category: "integrity" as const,
    alertCategory: "data_integrity" as AlertCategory | null,
    getRelatedAlerts: (input: QAChecklistInput): ValidationAlert[] => {
      return input.allAlerts.filter(a => 
        a.category === "data_integrity" && 
        (a.title.toLowerCase().includes("correction") || a.title.toLowerCase().includes("red") || a.title.toLowerCase().includes("erasure"))
      );
    },
    evaluate: (input: QAChecklistInput): { status: QACheckItemStatus; count: number; details: string | null } => {
      const correctionAlerts = input.allAlerts.filter(a => 
        a.category === "data_integrity" && 
        (a.title.toLowerCase().includes("correction") || a.title.toLowerCase().includes("red") || a.title.toLowerCase().includes("erasure"))
      );
      if (correctionAlerts.length > 0) {
        return { status: "fail", count: correctionAlerts.length, details: `${correctionAlerts.length} correction/erasure issues found` };
      }
      return { status: "pass", count: 0, details: "No unsigned corrections detected" };
    }
  },
  {
    id: "qa_23",
    checkNumber: 10,
    title: "Batch record reviewed & signed",
    description: "Batch record reviewed and signed by approved person from Production department.",
    category: "missing" as const,
    alertCategory: "missing_value" as AlertCategory | null,
    getRelatedAlerts: (input: QAChecklistInput): ValidationAlert[] => {
      return input.allAlerts.filter(a => 
        (a.title.toLowerCase().includes("signature") && a.title.toLowerCase().includes("review")) ||
        (a.title.toLowerCase().includes("verified by") && a.category === "missing_value") ||
        (a.title.toLowerCase().includes("approved by") && a.category === "missing_value")
      );
    },
    evaluate: (input: QAChecklistInput): { status: QACheckItemStatus; count: number; details: string | null } => {
      const reviewSignAlerts = input.allAlerts.filter(a => 
        (a.title.toLowerCase().includes("signature") && a.title.toLowerCase().includes("review")) ||
        (a.title.toLowerCase().includes("verified by") && a.category === "missing_value") ||
        (a.title.toLowerCase().includes("approved by") && a.category === "missing_value")
      );
      if (reviewSignAlerts.length > 0) {
        return { status: "fail", count: reviewSignAlerts.length, details: `${reviewSignAlerts.length} missing review signatures` };
      }
      if (input.missingSignatureCount > 0 && input.missingSignatureCount > 3) {
        return { status: "fail", count: 1, details: "Multiple missing signatures suggest incomplete review" };
      }
      return { status: "pass", count: 0, details: "Batch record appears reviewed and signed" };
    }
  },
  {
    id: "qa_24",
    checkNumber: 11,
    title: "No data integrity issues",
    description: "Any data integrity issues observed (Any alteration of data happened after completion of BMR entry).",
    category: "integrity" as const,
    alertCategory: "data_integrity" as AlertCategory | null,
    getRelatedAlerts: (input: QAChecklistInput): ValidationAlert[] => {
      return input.allAlerts.filter(a => a.category === "data_integrity");
    },
    evaluate: (input: QAChecklistInput): { status: QACheckItemStatus; count: number; details: string | null } => {
      const integrityAlerts = input.allAlerts.filter(a => a.category === "data_integrity");
      if (integrityAlerts.length > 0) {
        return { status: "fail", count: integrityAlerts.length, details: `${integrityAlerts.length} data integrity issues detected` };
      }
      return { status: "pass", count: 0, details: "No data integrity issues observed" };
    }
  },
  {
    id: "qa_25",
    checkNumber: 12,
    title: "User-declared batch details verified",
    description: "Product Name, Start/End Date, Batch No., Manufacturing Date, and Expiry Date match user-declared values entered at upload.",
    category: "discrepancies" as const,
    alertCategory: "consistency_error" as AlertCategory | null,
    getRelatedAlerts: (input: QAChecklistInput): ValidationAlert[] => {
      return input.allAlerts.filter(a => a.ruleId === "user_declared_verification");
    },
    evaluate: (input: QAChecklistInput): { status: QACheckItemStatus; count: number; details: string | null } => {
      if (!input.hasUserDeclaredFields) {
        return { status: "na", count: 0, details: "No user-declared batch details were provided at upload" };
      }
      const userDeclaredAlerts = input.allAlerts.filter(a => 
        a.ruleId === "user_declared_verification"
      );
      if (userDeclaredAlerts.length > 0) {
        return { status: "fail", count: userDeclaredAlerts.length, details: `${userDeclaredAlerts.length} field(s) do not match user-declared values` };
      }
      if (input.userDeclaredMismatchCount > 0) {
        return { status: "fail", count: input.userDeclaredMismatchCount, details: `${input.userDeclaredMismatchCount} field(s) do not match` };
      }
      return { status: "pass", count: 0, details: "All user-declared batch details match the document" };
    }
  },
];

export function evaluateQAChecklist(input: QAChecklistInput): QAChecklist {
  const items: QACheckItem[] = QA_CHECK_DEFINITIONS.map(def => {
    const result = def.evaluate(input);
    const relatedAlerts = result.status === "fail" ? def.getRelatedAlerts(input) : [];
    return {
      id: def.id,
      checkNumber: def.checkNumber,
      title: def.title,
      description: def.description,
      status: result.status,
      category: def.category,
      alertCategory: def.alertCategory,
      relatedAlertCount: result.count,
      details: result.details,
      relatedAlerts: relatedAlerts.length > 0 ? relatedAlerts : undefined,
    };
  });

  const passedChecks = items.filter(i => i.status === "pass").length;
  const failedChecks = items.filter(i => i.status === "fail").length;
  const naChecks = items.filter(i => i.status === "na").length;

  return {
    documentId: input.documentId,
    evaluatedAt: new Date().toISOString(),
    totalChecks: items.length,
    passedChecks,
    failedChecks,
    naChecks,
    items,
  };
}
