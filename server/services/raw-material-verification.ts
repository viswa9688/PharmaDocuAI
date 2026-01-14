import type { 
  RawMaterialLimit, 
  RawMaterialVerification,
  RawMaterialResult,
  InsertRawMaterialLimit,
  InsertRawMaterialResult
} from "@shared/schema";

export interface ExtractedMaterialRow {
  materialCode: string;
  materialName: string;
  bomQuantity?: string;
  bomQuantityValue?: number;
  bomQuantityUnit?: string;
  toleranceType: "percentage" | "fixed_range";
  toleranceDisplay?: string;
  tolerancePercent?: number;
  toleranceMin?: number;
  toleranceMax?: number;
  criticality: "critical" | "non-critical";
  approvedVendor?: string;
  confidence: number;
}

export interface ExtractedActualQuantity {
  materialCode: string;
  materialName?: string;
  actualQuantity: string;
  actualQuantityValue?: number;
  unit?: string;
  verifiedBy?: string;
  confidence: number;
}

export interface MaterialValidationResult {
  materialCode: string;
  materialName: string;
  bomQuantityValue: number | null;
  bomQuantityUnit: string | null;
  toleranceDisplay: string | null;
  actualQuantityValue: number | null;
  withinLimits: boolean | null;
  deviationPercent: number | null;
  criticality: string | null;
  notes: string | null;
}

export class RawMaterialVerificationService {
  private materialTableHeaders = [
    "material code",
    "material no",
    "material number",
    "item code",
    "item no",
    "raw material code",
    "rm code",
    "component code"
  ];

  private quantityHeaders = [
    "quantity",
    "qty",
    "amount",
    "weight",
    "mass",
    "bom qty",
    "bom quantity",
    "standard qty",
    "standard quantity"
  ];

  private toleranceHeaders = [
    "tolerance",
    "tol",
    "allowed variation",
    "acceptable range",
    "limit",
    "limits"
  ];

  private criticalKeywords = [
    "api",
    "active pharmaceutical",
    "active ingredient",
    "critical raw material",
    "critical component"
  ];

  extractMaterialLimitsFromTable(
    tables: any[],
    formFields: any[],
    rawText: string
  ): ExtractedMaterialRow[] {
    const results: ExtractedMaterialRow[] = [];
    
    for (const table of tables) {
      const headerRow = this.findHeaderRow(table);
      if (!headerRow) continue;

      const colIndices = this.mapColumnIndices(headerRow);
      if (colIndices.materialCode === -1) continue;

      for (let i = headerRow.rowIndex + 1; i < table.rows.length; i++) {
        const row = table.rows[i];
        const extracted = this.extractRowData(row, colIndices, rawText);
        if (extracted) {
          results.push(extracted);
        }
      }
    }

    if (results.length === 0) {
      const textExtracted = this.extractMaterialsFromRawText(rawText);
      results.push(...textExtracted);
    }

    return results;
  }

  private findHeaderRow(table: any): { cells: string[], rowIndex: number } | null {
    if (!table.rows || table.rows.length === 0) return null;

    for (let i = 0; i < Math.min(5, table.rows.length); i++) {
      const row = table.rows[i];
      const rowText = row.cells?.map((c: any) => 
        (typeof c === 'string' ? c : c.text || '').toLowerCase()
      ).join(' ') || '';

      for (const header of this.materialTableHeaders) {
        if (rowText.includes(header)) {
          return { 
            cells: row.cells.map((c: any) => 
              (typeof c === 'string' ? c : c.text || '').toLowerCase()
            ), 
            rowIndex: i 
          };
        }
      }
    }

    return null;
  }

  private mapColumnIndices(headerRow: { cells: string[], rowIndex: number }): {
    materialCode: number;
    materialName: number;
    quantity: number;
    tolerance: number;
    unit: number;
  } {
    const indices = {
      materialCode: -1,
      materialName: -1,
      quantity: -1,
      tolerance: -1,
      unit: -1
    };

    for (let i = 0; i < headerRow.cells.length; i++) {
      const cell = headerRow.cells[i];

      if (this.materialTableHeaders.some(h => cell.includes(h))) {
        indices.materialCode = i;
      } else if (cell.includes('name') || cell.includes('description') || cell.includes('material')) {
        if (indices.materialName === -1 && indices.materialCode !== i) {
          indices.materialName = i;
        }
      } else if (this.quantityHeaders.some(h => cell.includes(h))) {
        indices.quantity = i;
      } else if (this.toleranceHeaders.some(h => cell.includes(h))) {
        indices.tolerance = i;
      } else if (cell.includes('unit') || cell.includes('uom')) {
        indices.unit = i;
      }
    }

    return indices;
  }

  private extractRowData(
    row: any,
    colIndices: ReturnType<typeof this.mapColumnIndices>,
    rawText: string
  ): ExtractedMaterialRow | null {
    const cells = row.cells || [];
    const getCellText = (idx: number) => {
      if (idx < 0 || idx >= cells.length) return '';
      const cell = cells[idx];
      return typeof cell === 'string' ? cell.trim() : (cell.text || '').trim();
    };

    const materialCode = getCellText(colIndices.materialCode);
    if (!materialCode || materialCode.length < 2) return null;

    const materialName = getCellText(colIndices.materialName) || materialCode;
    const quantityRaw = getCellText(colIndices.quantity);
    const toleranceRaw = getCellText(colIndices.tolerance);
    const unitRaw = getCellText(colIndices.unit);

    const { value: bomValue, unit: bomUnit } = this.parseQuantity(quantityRaw, unitRaw);
    const tolerance = this.parseTolerance(toleranceRaw);
    const criticality = this.determineCriticality(materialName, materialCode, rawText);
    const toleranceType: "percentage" | "fixed_range" = 
      tolerance.percent !== undefined ? "percentage" : "fixed_range";

    return {
      materialCode,
      materialName,
      bomQuantity: quantityRaw,
      bomQuantityValue: bomValue,
      bomQuantityUnit: bomUnit,
      toleranceType,
      toleranceDisplay: toleranceRaw || undefined,
      tolerancePercent: tolerance.percent,
      toleranceMin: tolerance.min,
      toleranceMax: tolerance.max,
      criticality,
      confidence: 0.85
    };
  }

  private parseQuantity(quantityStr: string, unitStr?: string): { value: number | undefined; unit: string | undefined } {
    if (!quantityStr) return { value: undefined, unit: undefined };

    const match = quantityStr.match(/([0-9.,]+)\s*([a-zA-Z%]*)/);
    if (!match) return { value: undefined, unit: unitStr };

    const valueStr = match[1].replace(/,/g, '');
    const value = parseFloat(valueStr);
    const unit = match[2] || unitStr || undefined;

    return { 
      value: isNaN(value) ? undefined : value, 
      unit 
    };
  }

  private parseTolerance(toleranceStr: string): { 
    percent: number | undefined; 
    min: number | undefined; 
    max: number | undefined 
  } {
    if (!toleranceStr) return { percent: undefined, min: undefined, max: undefined };

    const percentMatch = toleranceStr.match(/[±+\-]?\s*([0-9.,]+)\s*%/);
    if (percentMatch) {
      const percent = parseFloat(percentMatch[1].replace(/,/g, ''));
      return { percent: isNaN(percent) ? undefined : percent, min: undefined, max: undefined };
    }

    const rangeMatch = toleranceStr.match(/([0-9.,]+)\s*[-–to]+\s*([0-9.,]+)/);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1].replace(/,/g, ''));
      const max = parseFloat(rangeMatch[2].replace(/,/g, ''));
      return { 
        percent: undefined, 
        min: isNaN(min) ? undefined : min, 
        max: isNaN(max) ? undefined : max 
      };
    }

    return { percent: undefined, min: undefined, max: undefined };
  }

  private determineCriticality(
    materialName: string, 
    materialCode: string, 
    rawText: string
  ): "critical" | "non-critical" {
    const combinedText = `${materialName} ${materialCode}`.toLowerCase();
    
    for (const keyword of this.criticalKeywords) {
      if (combinedText.includes(keyword)) {
        return "critical";
      }
    }

    const codePatterns = [/^api/i, /^rm-c/i, /^cr-/i];
    for (const pattern of codePatterns) {
      if (pattern.test(materialCode)) {
        return "critical";
      }
    }

    return "non-critical";
  }

  private extractMaterialsFromRawText(rawText: string): ExtractedMaterialRow[] {
    const results: ExtractedMaterialRow[] = [];
    
    const patterns = [
      /(?:material|item|component)\s*(?:code|no|#)?\s*[:.]?\s*([A-Z0-9\-]+)\s+(.+?)\s+([0-9.,]+)\s*(kg|g|mg|l|ml|%)?/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(rawText)) !== null) {
        results.push({
          materialCode: match[1],
          materialName: match[2].trim(),
          bomQuantity: match[3] + (match[4] || ''),
          bomQuantityValue: parseFloat(match[3].replace(/,/g, '')),
          bomQuantityUnit: match[4],
          toleranceType: "percentage",
          criticality: this.determineCriticality(match[2], match[1], rawText),
          confidence: 0.6
        });
      }
    }

    return results;
  }

  extractActualQuantitiesFromTable(
    tables: any[],
    formFields: any[],
    rawText: string
  ): ExtractedActualQuantity[] {
    const results: ExtractedActualQuantity[] = [];

    for (const table of tables) {
      const headerRow = this.findHeaderRow(table);
      if (!headerRow) continue;

      const colIndices = this.mapColumnIndices(headerRow);
      if (colIndices.materialCode === -1) continue;

      let actualQtyIndex = -1;
      for (let i = 0; i < headerRow.cells.length; i++) {
        const cell = headerRow.cells[i];
        if (cell.includes('actual') || cell.includes('used') || cell.includes('dispensed') || 
            cell.includes('weighed') || cell.includes('quantity used')) {
          actualQtyIndex = i;
          break;
        }
      }

      if (actualQtyIndex === -1 && colIndices.quantity !== -1) {
        actualQtyIndex = colIndices.quantity;
      }

      for (let i = headerRow.rowIndex + 1; i < table.rows.length; i++) {
        const row = table.rows[i];
        const cells = row.cells || [];
        
        const getCellText = (idx: number) => {
          if (idx < 0 || idx >= cells.length) return '';
          const cell = cells[idx];
          return typeof cell === 'string' ? cell.trim() : (cell.text || '').trim();
        };

        const materialCode = getCellText(colIndices.materialCode);
        if (!materialCode || materialCode.length < 2) continue;

        const actualQty = getCellText(actualQtyIndex);
        if (!actualQty) continue;

        const { value, unit } = this.parseQuantity(actualQty, undefined);

        results.push({
          materialCode,
          materialName: getCellText(colIndices.materialName) || undefined,
          actualQuantity: actualQty,
          actualQuantityValue: value,
          unit,
          confidence: 0.85
        });
      }
    }

    return results;
  }

  validateMaterialQuantities(
    limits: RawMaterialLimit[],
    actualQuantities: ExtractedActualQuantity[]
  ): MaterialValidationResult[] {
    const results: MaterialValidationResult[] = [];

    const limitsMap = new Map(limits.map(l => [l.materialCode.toLowerCase(), l]));

    for (const actual of actualQuantities) {
      const limit = limitsMap.get(actual.materialCode.toLowerCase());

      if (!limit) {
        results.push({
          materialCode: actual.materialCode,
          materialName: actual.materialName || actual.materialCode,
          bomQuantityValue: null,
          bomQuantityUnit: null,
          toleranceDisplay: null,
          actualQuantityValue: actual.actualQuantityValue || null,
          withinLimits: null,
          deviationPercent: null,
          criticality: null,
          notes: "Material not found in BoM limits"
        });
        continue;
      }

      const validation = this.validateSingleMaterial(limit, actual);
      results.push(validation);
    }

    for (const limit of limits) {
      const foundInActual = actualQuantities.some(
        a => a.materialCode.toLowerCase() === limit.materialCode.toLowerCase()
      );
      if (!foundInActual) {
        results.push({
          materialCode: limit.materialCode,
          materialName: limit.materialName,
          bomQuantityValue: limit.bomQuantityValue,
          bomQuantityUnit: limit.bomQuantityUnit,
          toleranceDisplay: limit.toleranceDisplay,
          actualQuantityValue: null,
          withinLimits: null,
          deviationPercent: null,
          criticality: limit.criticality,
          notes: "Material not found in batch record"
        });
      }
    }

    return results;
  }

  private validateSingleMaterial(
    limit: RawMaterialLimit,
    actual: ExtractedActualQuantity
  ): MaterialValidationResult {
    const bomValue = limit.bomQuantityValue;
    const actualValue = actual.actualQuantityValue;

    if (bomValue === null || actualValue === undefined) {
      return {
        materialCode: limit.materialCode,
        materialName: limit.materialName,
        bomQuantityValue: bomValue,
        bomQuantityUnit: limit.bomQuantityUnit,
        toleranceDisplay: limit.toleranceDisplay,
        actualQuantityValue: actualValue || null,
        withinLimits: null,
        deviationPercent: null,
        criticality: limit.criticality,
        notes: "Unable to validate - missing quantity value"
      };
    }

    const deviationPercent = ((actualValue - bomValue) / bomValue) * 100;
    let withinLimits = false;
    let notes: string | null = null;

    if (limit.tolerancePercent !== null) {
      const tolerance = limit.tolerancePercent;
      const minAllowed = bomValue * (1 - tolerance / 100);
      const maxAllowed = bomValue * (1 + tolerance / 100);
      withinLimits = actualValue >= minAllowed && actualValue <= maxAllowed;
      
      if (!withinLimits) {
        notes = `Deviation ${deviationPercent.toFixed(2)}% exceeds ±${tolerance}% tolerance`;
      }
    } else if (limit.toleranceMin !== null && limit.toleranceMax !== null) {
      withinLimits = actualValue >= limit.toleranceMin && actualValue <= limit.toleranceMax;
      
      if (!withinLimits) {
        notes = `Value ${actualValue} outside range ${limit.toleranceMin}-${limit.toleranceMax}`;
      }
    } else {
      const defaultTolerancePercent = 5;
      const minAllowed = bomValue * (1 - defaultTolerancePercent / 100);
      const maxAllowed = bomValue * (1 + defaultTolerancePercent / 100);
      withinLimits = actualValue >= minAllowed && actualValue <= maxAllowed;
      notes = withinLimits ? "Within default ±5% tolerance" : 
        `Deviation ${deviationPercent.toFixed(2)}% exceeds default ±5% tolerance`;
    }

    return {
      materialCode: limit.materialCode,
      materialName: limit.materialName,
      bomQuantityValue: bomValue,
      bomQuantityUnit: limit.bomQuantityUnit,
      toleranceDisplay: limit.toleranceDisplay,
      actualQuantityValue: actualValue,
      withinLimits,
      deviationPercent: Math.round(deviationPercent * 100) / 100,
      criticality: limit.criticality,
      notes
    };
  }

  convertLimitsToInsertRecords(
    extractedMaterials: ExtractedMaterialRow[],
    mpcNumber: string,
    productName?: string
  ): InsertRawMaterialLimit[] {
    return extractedMaterials.map(material => ({
      mpcNumber,
      productName: productName || null,
      materialCode: material.materialCode,
      materialName: material.materialName,
      bomQuantity: material.bomQuantity || "",
      bomQuantityValue: material.bomQuantityValue || null,
      bomQuantityUnit: material.bomQuantityUnit || null,
      toleranceType: material.toleranceType,
      tolerancePercent: material.tolerancePercent || null,
      toleranceMin: material.toleranceMin || null,
      toleranceMax: material.toleranceMax || null,
      toleranceDisplay: material.toleranceDisplay || null,
      criticality: material.criticality,
      approvedVendor: material.approvedVendor || null,
    }));
  }

  convertResultsToInsertRecords(
    validationResults: MaterialValidationResult[],
    verificationId: string
  ): InsertRawMaterialResult[] {
    return validationResults.map(result => ({
      verificationId,
      materialCode: result.materialCode,
      materialName: result.materialName,
      bomQuantity: result.bomQuantityValue !== null 
        ? `${result.bomQuantityValue}${result.bomQuantityUnit ? ' ' + result.bomQuantityUnit : ''}`
        : "",
      actualQuantity: result.actualQuantityValue !== null 
        ? String(result.actualQuantityValue) 
        : null,
      actualQuantityValue: result.actualQuantityValue,
      withinLimits: result.withinLimits,
      toleranceDisplay: result.toleranceDisplay,
      deviationPercent: result.deviationPercent,
      criticality: result.criticality,
      notes: result.notes,
    }));
  }
}

export const rawMaterialVerificationService = new RawMaterialVerificationService();
