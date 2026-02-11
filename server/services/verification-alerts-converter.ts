import type {
  ValidationAlert,
  AlertCategory,
  AlertSeverity,
  SourceLocation,
} from "@shared/schema";
import type { BatchAllocationExtraction } from "./batch-allocation-verification";

interface RawMaterialVerificationResult {
  materialCode: string;
  materialName: string;
  limitRange: string;
  minValue: number | null;
  maxValue: number | null;
  actualValue: number | null;
  actualDisplay: string;
  withinLimits: boolean | null;
  notes: string | null;
}

interface BMRDiscrepancyData {
  fieldName: string;
  mpcValue: string | null;
  bmrValue: string | null;
  severity: string;
  description: string;
  section?: string | null;
}

let alertCounter = 0;

function generateAlertId(prefix: string): string {
  return `${prefix}_${++alertCounter}_${Date.now()}`;
}

function makeSource(pageNumber: number, sectionType: string, fieldLabel: string): SourceLocation {
  return {
    pageNumber,
    sectionType,
    fieldLabel,
    boundingBox: { x: 0, y: 0, width: 0, height: 0 },
    surroundingContext: "",
  };
}

function mapDiscrepancySeverity(severity: string): AlertSeverity {
  switch (severity) {
    case "critical": return "critical";
    case "major": return "high";
    case "minor": return "medium";
    default: return "medium";
  }
}

export function convertBMRDiscrepanciesToAlerts(
  discrepancies: BMRDiscrepancyData[],
  matchedFields: string[],
  mpcPageNumber?: number,
  bmrPageNumber?: number,
): ValidationAlert[] {
  const alerts: ValidationAlert[] = [];

  for (const disc of discrepancies) {
    const source = makeSource(bmrPageNumber || 1, disc.section || "Product Information", disc.fieldName);

    alerts.push({
      id: generateAlertId("bmr_verify"),
      category: "consistency_error" as AlertCategory,
      severity: mapDiscrepancySeverity(disc.severity),
      title: `BMR Mismatch: ${disc.fieldName.replace(/_/g, " ")}`,
      message: disc.description,
      details: `MPC value: "${disc.mpcValue || "N/A"}" vs BMR value: "${disc.bmrValue || "N/A"}" — ${disc.severity} severity`,
      source,
      relatedValues: [],
      suggestedAction: `Review and correct the ${disc.fieldName.replace(/_/g, " ")} in the BMR to match the Master Product Card`,
      ruleId: "bmr_verification",
      formulaId: null,
      isResolved: false,
      resolvedBy: null,
      resolvedAt: null,
      resolution: null,
    });
  }

  if (matchedFields.length > 0 && discrepancies.length === 0) {
    alerts.push({
      id: generateAlertId("bmr_pass"),
      category: "consistency_error" as AlertCategory,
      severity: "info" as AlertSeverity,
      title: "BMR Verification Passed",
      message: `All ${matchedFields.length} compared fields match between MPC and BMR`,
      details: `Matched fields: ${matchedFields.join(", ")}`,
      source: makeSource(1, "BMR Verification", "all_fields"),
      relatedValues: [],
      suggestedAction: "No action needed — BMR matches Master Product Card",
      ruleId: "bmr_verification",
      formulaId: null,
      isResolved: false,
      resolvedBy: null,
      resolvedAt: null,
      resolution: null,
    });
  }

  return alerts;
}

export function convertRawMaterialResultsToAlerts(
  results: RawMaterialVerificationResult[],
): ValidationAlert[] {
  const alerts: ValidationAlert[] = [];

  for (const result of results) {
    if (result.withinLimits === false) {
      alerts.push({
        id: generateAlertId("rawmat_fail"),
        category: "range_violation" as AlertCategory,
        severity: "high" as AlertSeverity,
        title: `Raw Material Out of Range: ${result.materialName || result.materialCode}`,
        message: `Actual quantity (${result.actualDisplay}) is outside approved limits (${result.limitRange})`,
        details: `Material: ${result.materialCode} — ${result.materialName}. Expected: ${result.limitRange}, Actual: ${result.actualDisplay}. ${result.notes || ""}`,
        source: makeSource(1, "Raw Material Verification", result.materialCode),
        relatedValues: [],
        suggestedAction: `Verify the actual quantity for ${result.materialName} and confirm it meets approved limits`,
        ruleId: "raw_material_verification",
        formulaId: null,
        isResolved: false,
        resolvedBy: null,
        resolvedAt: null,
        resolution: null,
      });
    } else if (result.withinLimits === null && result.actualDisplay === "Not found") {
      alerts.push({
        id: generateAlertId("rawmat_miss"),
        category: "missing_value" as AlertCategory,
        severity: "medium" as AlertSeverity,
        title: `Raw Material Actual Not Found: ${result.materialName || result.materialCode}`,
        message: `No actual quantity found for material ${result.materialCode}`,
        details: `Material: ${result.materialCode} — ${result.materialName}. Expected range: ${result.limitRange}, but no matching actual value was found in the document.`,
        source: makeSource(1, "Raw Material Verification", result.materialCode),
        relatedValues: [],
        suggestedAction: `Ensure actual quantity for ${result.materialName} is recorded in the batch record`,
        ruleId: "raw_material_verification",
        formulaId: null,
        isResolved: false,
        resolvedBy: null,
        resolvedAt: null,
        resolution: null,
      });
    }
  }

  if (results.length > 0 && alerts.length === 0) {
    alerts.push({
      id: generateAlertId("rawmat_pass"),
      category: "range_violation" as AlertCategory,
      severity: "info" as AlertSeverity,
      title: "Raw Material Verification Passed",
      message: `All ${results.filter(r => r.withinLimits === true).length} materials are within approved limits`,
      details: `Materials checked: ${results.map(r => r.materialCode).join(", ")}`,
      source: makeSource(1, "Raw Material Verification", "all_materials"),
      relatedValues: [],
      suggestedAction: "No action needed — all raw materials within limits",
      ruleId: "raw_material_verification",
      formulaId: null,
      isResolved: false,
      resolvedBy: null,
      resolvedAt: null,
      resolution: null,
    });
  }

  return alerts;
}

export function convertBatchAllocationToAlerts(
  extraction: BatchAllocationExtraction,
): ValidationAlert[] {
  const alerts: ValidationAlert[] = [];

  if (extraction.datesMatch === false) {
    alerts.push({
      id: generateAlertId("batchalloc_date"),
      category: "sequence_error" as AlertCategory,
      severity: "high" as AlertSeverity,
      title: "Batch Allocation: Date Mismatch",
      message: `Manufacturing/Expiry dates do not produce a valid shelf life`,
      details: `Mfg Date: ${extraction.manufacturingDate || "N/A"}, Exp Date: ${extraction.expiryDate || "N/A"}, Calculated shelf life: ${extraction.shelfLifeCalculated ?? "N/A"} months`,
      source: makeSource(1, "Batch Allocation", "dates"),
      relatedValues: [],
      suggestedAction: "Verify manufacturing and expiry dates in the Batch Allocation Log",
      ruleId: "batch_allocation_verification",
      formulaId: null,
      isResolved: false,
      resolvedBy: null,
      resolvedAt: null,
      resolution: null,
    });
  }

  if (!extraction.manufacturingDate) {
    alerts.push({
      id: generateAlertId("batchalloc_mfg"),
      category: "missing_value" as AlertCategory,
      severity: "high" as AlertSeverity,
      title: "Batch Allocation: Missing Manufacturing Date",
      message: "Manufacturing date was not found in the document",
      details: "The Manufacturing Date field could not be extracted from the Batch Allocation Log",
      source: makeSource(1, "Batch Allocation", "manufacturing_date"),
      relatedValues: [],
      suggestedAction: "Ensure the manufacturing date is clearly recorded in the Batch Allocation Log",
      ruleId: "batch_allocation_verification",
      formulaId: null,
      isResolved: false,
      resolvedBy: null,
      resolvedAt: null,
      resolution: null,
    });
  }

  if (!extraction.expiryDate) {
    alerts.push({
      id: generateAlertId("batchalloc_exp"),
      category: "missing_value" as AlertCategory,
      severity: "high" as AlertSeverity,
      title: "Batch Allocation: Missing Expiry Date",
      message: "Expiry date was not found in the document",
      details: "The Expiry Date field could not be extracted from the Batch Allocation Log",
      source: makeSource(1, "Batch Allocation", "expiry_date"),
      relatedValues: [],
      suggestedAction: "Ensure the expiry date is clearly recorded in the Batch Allocation Log",
      ruleId: "batch_allocation_verification",
      formulaId: null,
      isResolved: false,
      resolvedBy: null,
      resolvedAt: null,
      resolution: null,
    });
  }

  if (extraction.isCompliant === false) {
    alerts.push({
      id: generateAlertId("batchalloc_comply"),
      category: "sop_violation" as AlertCategory,
      severity: "critical" as AlertSeverity,
      title: "Batch Allocation: Non-Compliant",
      message: "The batch allocation has been flagged as non-compliant",
      details: `Batch: ${extraction.batchNumber || "N/A"}, MPC: ${extraction.mpcNumber || "N/A"}, BMR: ${extraction.bmrNumber || "N/A"}`,
      source: makeSource(1, "Batch Allocation", "compliance"),
      relatedValues: [],
      suggestedAction: "Review the batch allocation log and address compliance issues before proceeding",
      ruleId: "batch_allocation_verification",
      formulaId: null,
      isResolved: false,
      resolvedBy: null,
      resolvedAt: null,
      resolution: null,
    });
  }

  if (!extraction.batchNumber) {
    alerts.push({
      id: generateAlertId("batchalloc_bn"),
      category: "missing_value" as AlertCategory,
      severity: "medium" as AlertSeverity,
      title: "Batch Allocation: Missing Batch Number",
      message: "Batch number was not found in the document",
      details: "The Batch Number field could not be extracted from the Batch Allocation Log",
      source: makeSource(1, "Batch Allocation", "batch_number"),
      relatedValues: [],
      suggestedAction: "Ensure the batch number is clearly recorded in the Batch Allocation Log",
      ruleId: "batch_allocation_verification",
      formulaId: null,
      isResolved: false,
      resolvedBy: null,
      resolvedAt: null,
      resolution: null,
    });
  }

  if (extraction.shelfLifeMonths !== null && extraction.shelfLifeCalculated !== null &&
      extraction.shelfLifeMonths !== extraction.shelfLifeCalculated) {
    alerts.push({
      id: generateAlertId("batchalloc_shelf"),
      category: "calculation_error" as AlertCategory,
      severity: "high" as AlertSeverity,
      title: "Batch Allocation: Shelf Life Discrepancy",
      message: `Stated shelf life (${extraction.shelfLifeMonths} months) doesn't match calculated (${extraction.shelfLifeCalculated} months)`,
      details: `Mfg: ${extraction.manufacturingDate}, Exp: ${extraction.expiryDate}. Stated shelf life: ${extraction.shelfLifeMonths} months, Calculated: ${extraction.shelfLifeCalculated} months`,
      source: makeSource(1, "Batch Allocation", "shelf_life"),
      relatedValues: [],
      suggestedAction: "Verify the shelf life calculation and correct any discrepancy",
      ruleId: "batch_allocation_verification",
      formulaId: null,
      isResolved: false,
      resolvedBy: null,
      resolvedAt: null,
      resolution: null,
    });
  }

  if (alerts.length === 0 && extraction.datesMatch !== null) {
    alerts.push({
      id: generateAlertId("batchalloc_pass"),
      category: "sequence_error" as AlertCategory,
      severity: "info" as AlertSeverity,
      title: "Batch Allocation Verification Passed",
      message: `Batch allocation dates and shelf life are valid`,
      details: `Batch: ${extraction.batchNumber || "N/A"}, Mfg: ${extraction.manufacturingDate || "N/A"}, Exp: ${extraction.expiryDate || "N/A"}, Shelf Life: ${extraction.shelfLifeCalculated || "N/A"} months`,
      source: makeSource(1, "Batch Allocation", "all_fields"),
      relatedValues: [],
      suggestedAction: "No action needed — batch allocation verification passed",
      ruleId: "batch_allocation_verification",
      formulaId: null,
      isResolved: false,
      resolvedBy: null,
      resolvedAt: null,
      resolution: null,
    });
  }

  return alerts;
}
