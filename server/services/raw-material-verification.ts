import type { 
  RawMaterialVerification,
  RawMaterialResult,
  InsertRawMaterialResult
} from "@shared/schema";

export interface ExtractedLimit {
  materialCode: string;
  materialName: string;
  minValue: number | null;
  maxValue: number | null;
  targetValue: number | null;
  unit: string;
  rangeDisplay: string;
  confidence: number;
}

export interface ExtractedActual {
  materialCode: string;
  materialName: string;
  actualValue: number | null;
  unit: string;
  rawText: string;
  confidence: number;
}

export interface VerificationResult {
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

export interface PageClassification {
  pageNumber: number;
  pageType: "limits" | "verification" | "unknown";
  confidence: number;
  keywords: string[];
}

export class RawMaterialVerificationService {
  
  private limitsKeywords = [
    "bill of material",
    "bom",
    "material specification",
    "specification",
    "standard quantity",
    "range",
    "limit",
    "tolerance",
    "min",
    "max",
    "approved qty",
    "master product",
    "mpc"
  ];

  private verificationKeywords = [
    "batch record",
    "actual qty",
    "actual quantity",
    "dispensed",
    "weighed",
    "batch manufacturing",
    "bmr",
    "raw material verification",
    "material dispensing",
    "issued qty",
    "issued quantity",
    "quantity issued"
  ];

  classifyPages(pagesData: { pageNumber: number; rawText: string }[]): PageClassification[] {
    const classifications: PageClassification[] = [];

    for (const page of pagesData) {
      const textLower = page.rawText.toLowerCase();
      
      let limitsScore = 0;
      let verificationScore = 0;
      const limitsMatches: string[] = [];
      const verificationMatches: string[] = [];

      for (const keyword of this.limitsKeywords) {
        if (textLower.includes(keyword)) {
          limitsScore += keyword.length > 5 ? 2 : 1;
          limitsMatches.push(keyword);
        }
      }

      for (const keyword of this.verificationKeywords) {
        if (textLower.includes(keyword)) {
          verificationScore += keyword.length > 5 ? 2 : 1;
          verificationMatches.push(keyword);
        }
      }

      let pageType: "limits" | "verification" | "unknown" = "unknown";
      let confidence = 0;
      let keywords: string[] = [];

      if (limitsScore > verificationScore && limitsScore >= 2) {
        pageType = "limits";
        confidence = Math.min(100, limitsScore * 15);
        keywords = limitsMatches;
      } else if (verificationScore > limitsScore && verificationScore >= 2) {
        pageType = "verification";
        confidence = Math.min(100, verificationScore * 15);
        keywords = verificationMatches;
      } else if (limitsScore === verificationScore && limitsScore > 0) {
        pageType = page.pageNumber === 1 ? "limits" : "verification";
        confidence = 50;
        keywords = [...limitsMatches, ...verificationMatches];
      }

      classifications.push({
        pageNumber: page.pageNumber,
        pageType,
        confidence,
        keywords
      });
    }

    return classifications;
  }

  extractLimitsFromPage(tables: any[], rawText: string): ExtractedLimit[] {
    const limits: ExtractedLimit[] = [];
    
    for (const table of tables) {
      if (!table.rows || table.rows.length < 2) continue;
      
      const headerRow = this.findHeaderRowWithRanges(table);
      if (!headerRow) continue;

      const colMap = this.mapLimitsColumns(headerRow.cells);
      if (colMap.materialCol === -1) continue;

      for (let i = headerRow.rowIndex + 1; i < table.rows.length; i++) {
        const row = table.rows[i];
        if (!row.cells || row.cells.length === 0) continue;

        const cells = row.cells.map((c: any) => 
          (typeof c === 'string' ? c : c.text || '').trim()
        );

        const materialCode = cells[colMap.materialCol] || "";
        if (!materialCode || materialCode.length < 2) continue;

        const materialName = colMap.nameCol >= 0 ? cells[colMap.nameCol] || "" : "";
        
        let minValue: number | null = null;
        let maxValue: number | null = null;
        let targetValue: number | null = null;
        let unit = "";
        let rangeDisplay = "";

        if (colMap.minCol >= 0 && colMap.maxCol >= 0) {
          const minText = cells[colMap.minCol] || "";
          const maxText = cells[colMap.maxCol] || "";
          minValue = this.parseNumber(minText);
          maxValue = this.parseNumber(maxText);
          unit = this.extractUnit(minText) || this.extractUnit(maxText) || "";
          rangeDisplay = `${minText} - ${maxText}`;
        } else if (colMap.rangeCol >= 0) {
          const rangeText = cells[colMap.rangeCol] || "";
          const parsed = this.parseRangeText(rangeText);
          minValue = parsed.min;
          maxValue = parsed.max;
          unit = parsed.unit;
          rangeDisplay = rangeText;
        } else if (colMap.qtyCol >= 0) {
          const qtyText = cells[colMap.qtyCol] || "";
          targetValue = this.parseNumber(qtyText);
          unit = this.extractUnit(qtyText) || "";
          if (targetValue !== null) {
            minValue = targetValue * 0.98;
            maxValue = targetValue * 1.02;
            rangeDisplay = `${qtyText} (±2%)`;
          }
        }

        if ((minValue !== null && maxValue !== null) || targetValue !== null) {
          limits.push({
            materialCode,
            materialName,
            minValue,
            maxValue,
            targetValue,
            unit,
            rangeDisplay,
            confidence: 80
          });
        }
      }
    }

    if (limits.length === 0) {
      const textLimits = this.extractLimitsFromText(rawText);
      limits.push(...textLimits);
    }

    return limits;
  }

  extractActualsFromPage(tables: any[], rawText: string): ExtractedActual[] {
    const actuals: ExtractedActual[] = [];
    
    for (const table of tables) {
      if (!table.rows || table.rows.length < 2) continue;
      
      const headerRow = this.findHeaderRowWithActuals(table);
      if (!headerRow) continue;

      const colMap = this.mapActualsColumns(headerRow.cells);
      if (colMap.materialCol === -1 || colMap.actualCol === -1) continue;

      for (let i = headerRow.rowIndex + 1; i < table.rows.length; i++) {
        const row = table.rows[i];
        if (!row.cells || row.cells.length === 0) continue;

        const cells = row.cells.map((c: any) => 
          (typeof c === 'string' ? c : c.text || '').trim()
        );

        const materialCode = cells[colMap.materialCol] || "";
        if (!materialCode || materialCode.length < 2) continue;

        const materialName = colMap.nameCol >= 0 ? cells[colMap.nameCol] || "" : "";
        const actualText = cells[colMap.actualCol] || "";
        const actualValue = this.parseNumber(actualText);
        const unit = this.extractUnit(actualText) || "";

        actuals.push({
          materialCode,
          materialName,
          actualValue,
          unit,
          rawText: actualText,
          confidence: actualValue !== null ? 85 : 50
        });
      }
    }

    if (actuals.length === 0) {
      const textActuals = this.extractActualsFromText(rawText);
      actuals.push(...textActuals);
    }

    return actuals;
  }

  compareAndValidate(limits: ExtractedLimit[], actuals: ExtractedActual[]): VerificationResult[] {
    const results: VerificationResult[] = [];

    for (const limit of limits) {
      const matchingActual = this.findMatchingActual(limit, actuals);
      
      let withinLimits: boolean | null = null;
      let notes: string | null = null;
      let actualValue: number | null = null;
      let actualDisplay = "Not found";

      if (matchingActual) {
        actualValue = matchingActual.actualValue;
        actualDisplay = matchingActual.rawText || (actualValue?.toString() ?? "N/A");

        if (actualValue !== null && limit.minValue !== null && limit.maxValue !== null) {
          withinLimits = actualValue >= limit.minValue && actualValue <= limit.maxValue;
          if (!withinLimits) {
            if (actualValue < limit.minValue) {
              notes = `Below minimum by ${(limit.minValue - actualValue).toFixed(2)}`;
            } else {
              notes = `Above maximum by ${(actualValue - limit.maxValue).toFixed(2)}`;
            }
          }
        } else if (actualValue === null) {
          notes = "Could not parse actual value";
        }
      } else {
        notes = "No matching actual value found in verification page";
      }

      results.push({
        materialCode: limit.materialCode,
        materialName: limit.materialName,
        limitRange: limit.rangeDisplay,
        minValue: limit.minValue,
        maxValue: limit.maxValue,
        actualValue,
        actualDisplay,
        withinLimits,
        notes
      });
    }

    return results;
  }

  private findMatchingActual(limit: ExtractedLimit, actuals: ExtractedActual[]): ExtractedActual | null {
    const normalizedLimitCode = this.normalizeCode(limit.materialCode);
    
    for (const actual of actuals) {
      const normalizedActualCode = this.normalizeCode(actual.materialCode);
      if (normalizedLimitCode === normalizedActualCode) {
        return actual;
      }
    }

    for (const actual of actuals) {
      if (this.fuzzyMatch(limit.materialCode, actual.materialCode)) {
        return actual;
      }
      if (limit.materialName && actual.materialName && 
          this.fuzzyMatch(limit.materialName, actual.materialName)) {
        return actual;
      }
    }

    return null;
  }

  private normalizeCode(code: string): string {
    return code.toLowerCase()
      .replace(/[\s\-_\.]/g, "")
      .replace(/^(rm|mat|item|code)/i, "");
  }

  private fuzzyMatch(a: string, b: string): boolean {
    const normA = this.normalizeCode(a);
    const normB = this.normalizeCode(b);
    return normA.includes(normB) || normB.includes(normA);
  }

  private findHeaderRowWithRanges(table: any): { cells: string[], rowIndex: number } | null {
    const rangeKeywords = ["min", "max", "range", "limit", "qty", "quantity", "material", "code", "name", "item"];
    
    for (let i = 0; i < Math.min(5, table.rows.length); i++) {
      const row = table.rows[i];
      const cells = row.cells?.map((c: any) => 
        (typeof c === 'string' ? c : c.text || '').toLowerCase()
      ) || [];
      
      const matches = cells.filter((cell: string) => 
        rangeKeywords.some(kw => cell.includes(kw))
      ).length;

      if (matches >= 2) {
        return { cells, rowIndex: i };
      }
    }
    return null;
  }

  private findHeaderRowWithActuals(table: any): { cells: string[], rowIndex: number } | null {
    const actualKeywords = ["actual", "qty", "quantity", "dispensed", "weighed", "issued", "material", "code", "name", "item"];
    
    for (let i = 0; i < Math.min(5, table.rows.length); i++) {
      const row = table.rows[i];
      const cells = row.cells?.map((c: any) => 
        (typeof c === 'string' ? c : c.text || '').toLowerCase()
      ) || [];
      
      const matches = cells.filter((cell: string) => 
        actualKeywords.some(kw => cell.includes(kw))
      ).length;

      if (matches >= 2) {
        return { cells, rowIndex: i };
      }
    }
    return null;
  }

  private mapLimitsColumns(headerCells: string[]): { 
    materialCol: number; 
    nameCol: number; 
    minCol: number; 
    maxCol: number; 
    rangeCol: number;
    qtyCol: number;
  } {
    let materialCol = -1, nameCol = -1, minCol = -1, maxCol = -1, rangeCol = -1, qtyCol = -1;
    
    for (let i = 0; i < headerCells.length; i++) {
      const cell = headerCells[i].toLowerCase();
      if (cell.includes("code") || cell.includes("material no") || cell.includes("item")) {
        materialCol = i;
      } else if (cell.includes("name") || cell.includes("description")) {
        nameCol = i;
      } else if (cell.includes("min") && !cell.includes("admin")) {
        minCol = i;
      } else if (cell.includes("max")) {
        maxCol = i;
      } else if (cell.includes("range") || cell.includes("limit")) {
        rangeCol = i;
      } else if (cell.includes("qty") || cell.includes("quantity") || cell.includes("amount")) {
        qtyCol = i;
      }
    }

    return { materialCol, nameCol, minCol, maxCol, rangeCol, qtyCol };
  }

  private mapActualsColumns(headerCells: string[]): { 
    materialCol: number; 
    nameCol: number; 
    actualCol: number;
  } {
    let materialCol = -1, nameCol = -1, actualCol = -1;
    
    for (let i = 0; i < headerCells.length; i++) {
      const cell = headerCells[i].toLowerCase();
      if (cell.includes("code") || cell.includes("material no") || cell.includes("item")) {
        materialCol = i;
      } else if (cell.includes("name") || cell.includes("description")) {
        nameCol = i;
      } else if (cell.includes("actual") || cell.includes("dispensed") || cell.includes("weighed") || 
                 cell.includes("issued") || cell.includes("qty") || cell.includes("quantity")) {
        actualCol = i;
      }
    }

    return { materialCol, nameCol, actualCol };
  }

  private parseNumber(text: string): number | null {
    if (!text) return null;
    const cleaned = text.replace(/[^\d.\-]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  private extractUnit(text: string): string {
    const match = text.match(/(kg|g|mg|ml|l|liters?|grams?|kilograms?|milligrams?)/i);
    return match ? match[1].toLowerCase() : "";
  }

  private parseRangeText(text: string): { min: number | null; max: number | null; unit: string } {
    const rangeMatch = text.match(/([\d.]+)\s*[-–—to]+\s*([\d.]+)/i);
    if (rangeMatch) {
      return {
        min: parseFloat(rangeMatch[1]),
        max: parseFloat(rangeMatch[2]),
        unit: this.extractUnit(text)
      };
    }
    return { min: null, max: null, unit: "" };
  }

  private extractLimitsFromText(rawText: string): ExtractedLimit[] {
    const limits: ExtractedLimit[] = [];
    const lines = rawText.split('\n');
    
    const rangePattern = /([A-Z0-9\-]+)\s+[\w\s]+\s+([\d.]+)\s*[-–—to]+\s*([\d.]+)\s*(kg|g|mg|ml|l)?/gi;
    let match;
    
    while ((match = rangePattern.exec(rawText)) !== null) {
      limits.push({
        materialCode: match[1],
        materialName: "",
        minValue: parseFloat(match[2]),
        maxValue: parseFloat(match[3]),
        targetValue: null,
        unit: match[4] || "",
        rangeDisplay: `${match[2]} - ${match[3]} ${match[4] || ""}`.trim(),
        confidence: 60
      });
    }

    return limits;
  }

  private extractActualsFromText(rawText: string): ExtractedActual[] {
    const actuals: ExtractedActual[] = [];
    
    const pattern = /([A-Z0-9\-]+)\s+[\w\s]+\s+([\d.]+)\s*(kg|g|mg|ml|l)?/gi;
    let match;
    
    while ((match = pattern.exec(rawText)) !== null) {
      actuals.push({
        materialCode: match[1],
        materialName: "",
        actualValue: parseFloat(match[2]),
        unit: match[3] || "",
        rawText: `${match[2]} ${match[3] || ""}`.trim(),
        confidence: 50
      });
    }

    return actuals;
  }
}

export const rawMaterialVerificationService = new RawMaterialVerificationService();
