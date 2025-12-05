import type {
  ExtractedValue,
  DetectedFormula,
  ValidationAlert,
  PageValidationResult,
  DocumentValidationSummary,
  SourceLocation,
  BoundingBox,
  FormulaType,
  AlertCategory,
  AlertSeverity,
  SOPRule,
} from "@shared/schema";

interface PageMetadata {
  extraction?: {
    tables?: any[];
    formFields?: any[];
    checkboxes?: any[];
    handwritten?: any[];
    textBlocks?: any[];
    pageDimensions?: { width: number; height: number };
  };
  layout?: {
    sections?: any[];
    pageStructure?: any;
  };
}

export class ValidationEngine {
  private sopRules: SOPRule[] = [];
  private valueIdCounter = 0;
  private alertIdCounter = 0;
  private formulaIdCounter = 0;

  constructor() {
    this.loadDefaultSOPRules();
  }

  private generateValueId(): string {
    return `val_${++this.valueIdCounter}_${Date.now()}`;
  }

  private generateAlertId(): string {
    return `alert_${++this.alertIdCounter}_${Date.now()}`;
  }

  private generateFormulaId(): string {
    return `formula_${++this.formulaIdCounter}_${Date.now()}`;
  }

  private loadDefaultSOPRules(): void {
    this.sopRules = [
      {
        id: "temp_min_storage",
        name: "Minimum Storage Temperature",
        description: "Storage temperature must be at least 2°C",
        category: "range_violation",
        severity: "high",
        enabled: true,
        conditions: [{
          fieldPattern: "(storage|hold).*temp",
          sectionTypes: ["materials_log", "filling_log"],
          operator: "greater_than",
          value: 2,
          unit: "°C"
        }],
        errorMessage: "Storage temperature below minimum threshold of 2°C",
        suggestedAction: "Verify temperature reading and check cold chain integrity"
      },
      {
        id: "temp_max_storage",
        name: "Maximum Storage Temperature",
        description: "Storage temperature must not exceed 8°C",
        category: "range_violation",
        severity: "high",
        enabled: true,
        conditions: [{
          fieldPattern: "(storage|hold).*temp",
          sectionTypes: ["materials_log", "filling_log"],
          operator: "less_than",
          value: 8,
          unit: "°C"
        }],
        errorMessage: "Storage temperature exceeds maximum threshold of 8°C",
        suggestedAction: "Verify temperature reading and investigate temperature excursion"
      },
      {
        id: "cip_temp_min",
        name: "CIP Minimum Temperature",
        description: "CIP rinse temperature must be at least 65°C",
        category: "range_violation",
        severity: "critical",
        enabled: true,
        conditions: [{
          fieldPattern: "(cip|clean).*(rinse|wash).*temp",
          sectionTypes: ["cip_sip_record"],
          operator: "greater_than",
          value: 65,
          unit: "°C"
        }],
        errorMessage: "CIP rinse temperature below minimum 65°C requirement",
        suggestedAction: "Review cleaning process and verify temperature sensors"
      },
      {
        id: "sip_temp_min",
        name: "SIP Minimum Temperature",
        description: "SIP sterilization temperature must be at least 121°C",
        category: "range_violation",
        severity: "critical",
        enabled: true,
        conditions: [{
          fieldPattern: "(sip|steril).*temp",
          sectionTypes: ["cip_sip_record"],
          operator: "greater_than",
          value: 121,
          unit: "°C"
        }],
        errorMessage: "SIP sterilization temperature below minimum 121°C requirement",
        suggestedAction: "Review sterilization cycle and verify autoclave parameters"
      },
      {
        id: "hold_time_max",
        name: "Maximum Hold Time",
        description: "Hold time must not exceed 24 hours",
        category: "range_violation",
        severity: "high",
        enabled: true,
        conditions: [{
          fieldPattern: "hold.*time",
          sectionTypes: ["materials_log", "filling_log", "filtration_step"],
          operator: "less_than",
          value: 24,
          unit: "hours"
        }],
        errorMessage: "Hold time exceeds maximum 24-hour limit",
        suggestedAction: "Evaluate product stability and consider re-processing"
      },
      {
        id: "ph_range",
        name: "pH Range Validation",
        description: "pH must be within acceptable range (6.0 - 8.0)",
        category: "range_violation",
        severity: "high",
        enabled: true,
        conditions: [{
          fieldPattern: "\\bph\\b",
          sectionTypes: ["materials_log", "filling_log", "inspection_sheet"],
          operator: "between",
          value: [6.0, 8.0]
        }],
        errorMessage: "pH value outside acceptable range (6.0 - 8.0)",
        suggestedAction: "Verify pH measurement and consider buffer adjustment"
      },
      {
        id: "pressure_differential",
        name: "Filter Pressure Differential",
        description: "Pressure differential must not exceed 15 psi",
        category: "range_violation",
        severity: "medium",
        enabled: true,
        conditions: [{
          fieldPattern: "(pressure|differential|delta.*p)",
          sectionTypes: ["filtration_step"],
          operator: "less_than",
          value: 15,
          unit: "psi"
        }],
        errorMessage: "Pressure differential exceeds 15 psi limit",
        suggestedAction: "Check filter integrity and consider filter replacement"
      },
      {
        id: "yield_min",
        name: "Minimum Yield Percentage",
        description: "Yield percentage should be at least 90%",
        category: "range_violation",
        severity: "medium",
        enabled: true,
        conditions: [{
          fieldPattern: "yield.*(%|percent)",
          sectionTypes: ["reconciliation_page", "filling_log"],
          operator: "greater_than",
          value: 90
        }],
        errorMessage: "Yield percentage below 90% threshold",
        suggestedAction: "Investigate yield loss and document root cause"
      },
      {
        id: "equipment_id_required",
        name: "Equipment ID Required",
        description: "Equipment ID must be present",
        category: "missing_value",
        severity: "medium",
        enabled: true,
        conditions: [{
          fieldPattern: "equipment.*(id|number|#)",
          sectionTypes: ["equipment_log", "cip_sip_record", "filtration_step"],
          operator: "exists",
          value: true
        }],
        errorMessage: "Equipment ID is missing",
        suggestedAction: "Record equipment identification number"
      },
      {
        id: "operator_signature_required",
        name: "Operator Signature Required",
        description: "Operator signature must be present",
        category: "missing_value",
        severity: "high",
        enabled: true,
        conditions: [{
          fieldPattern: "operator.*(sign|initial)",
          sectionTypes: ["materials_log", "equipment_log", "cip_sip_record", "filtration_step", "filling_log"],
          operator: "exists",
          value: true
        }],
        errorMessage: "Operator signature is missing",
        suggestedAction: "Obtain operator signature for verification"
      }
    ];
  }

  async validatePage(
    pageNumber: number,
    metadata: PageMetadata,
    classification: string,
    extractedText: string
  ): Promise<PageValidationResult> {
    const extractedValues = this.extractValues(pageNumber, metadata, classification, extractedText);
    const detectedFormulas = this.detectFormulas(extractedValues, pageNumber, classification);
    const alerts: ValidationAlert[] = [];

    for (const formula of detectedFormulas) {
      if (!formula.isWithinTolerance && formula.discrepancy !== null) {
        alerts.push(this.createFormulaAlert(formula));
      }
    }

    const ruleAlerts = this.applyRules(extractedValues, classification, pageNumber);
    alerts.push(...ruleAlerts);

    return {
      pageNumber,
      extractedValues,
      detectedFormulas,
      alerts,
      validationTimestamp: new Date(),
      extractedText
    };
  }

  async validateDocument(
    documentId: string,
    pageResults: PageValidationResult[]
  ): Promise<DocumentValidationSummary> {
    const crossPageAlerts = this.validateCrossPageConsistency(pageResults);
    
    const allAlerts = [
      ...pageResults.flatMap(p => p.alerts),
      ...crossPageAlerts
    ];

    const alertsBySeverity: Record<AlertSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0
    };

    const alertsByCategory: Record<AlertCategory, number> = {
      calculation_error: 0,
      missing_value: 0,
      range_violation: 0,
      sequence_error: 0,
      unit_mismatch: 0,
      trend_anomaly: 0,
      consistency_error: 0,
      format_error: 0,
      sop_violation: 0,
      data_quality: 0
    };

    for (const alert of allAlerts) {
      alertsBySeverity[alert.severity]++;
      alertsByCategory[alert.category]++;
    }

    const allFormulas = pageResults.flatMap(p => p.detectedFormulas);
    const formulaDiscrepancies = allFormulas.filter(f => !f.isWithinTolerance).length;

    return {
      documentId,
      totalPages: pageResults.length,
      pagesValidated: pageResults.length,
      totalAlerts: allAlerts.length,
      alertsBySeverity,
      alertsByCategory,
      formulasChecked: allFormulas.length,
      formulaDiscrepancies,
      crossPageIssues: crossPageAlerts,
      validationTimestamp: new Date(),
      isComplete: true
    };
  }

  private extractValues(
    pageNumber: number,
    metadata: PageMetadata,
    classification: string,
    extractedText: string
  ): ExtractedValue[] {
    const values: ExtractedValue[] = [];
    const extraction = metadata?.extraction;

    if (extraction?.formFields) {
      for (const field of extraction.formFields) {
        const extracted = this.parseFormField(field, pageNumber, classification);
        if (extracted) values.push(extracted);
      }
    }

    if (extraction?.tables) {
      for (const table of extraction.tables) {
        const tableValues = this.parseTable(table, pageNumber, classification);
        values.push(...tableValues);
      }
    }

    if (extraction?.handwritten) {
      for (const hw of extraction.handwritten) {
        const extracted = this.parseHandwritten(hw, pageNumber, classification);
        if (extracted) values.push(extracted);
      }
    }

    const textValues = this.parseTextForValues(extractedText, pageNumber, classification);
    values.push(...textValues);

    return values;
  }

  private parseFormField(field: any, pageNumber: number, sectionType: string): ExtractedValue | null {
    if (!field.fieldName) return null;
    
    const fieldValue = field.fieldValue || "";
    const numericMatch = fieldValue.match(/[-+]?\d*\.?\d+/);
    const numericValue = numericMatch ? parseFloat(numericMatch[0]) : null;
    const unit = fieldValue ? this.extractUnit(fieldValue) : null;
    const valueType = fieldValue ? this.determineValueType(fieldValue) : "text";

    return {
      id: this.generateValueId(),
      rawValue: fieldValue,
      numericValue,
      unit,
      valueType,
      source: {
        pageNumber,
        sectionType,
        fieldLabel: field.fieldName,
        boundingBox: field.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
        surroundingContext: field.fieldName
      },
      confidence: field.confidence || 0.8,
      isHandwritten: false
    };
  }

  private parseTable(table: any, pageNumber: number, sectionType: string): ExtractedValue[] {
    const values: ExtractedValue[] = [];
    
    if (!table.rows) return values;

    const headers = table.rows[0]?.cells?.map((c: any) => c.text || "") || [];

    for (let rowIdx = 1; rowIdx < table.rows.length; rowIdx++) {
      const row = table.rows[rowIdx];
      if (!row.cells) continue;

      for (let colIdx = 0; colIdx < row.cells.length; colIdx++) {
        const cell = row.cells[colIdx];
        const cellText = cell.text || "";
        
        if (!cellText.trim()) continue;

        const numericMatch = cellText.match(/[-+]?\d*\.?\d+/);
        if (!numericMatch) continue;

        const header = headers[colIdx] || `Column ${colIdx + 1}`;
        const numericValue = parseFloat(numericMatch[0]);
        const unit = this.extractUnit(cellText);

        values.push({
          id: this.generateValueId(),
          rawValue: cellText,
          numericValue,
          unit,
          valueType: "numeric",
          source: {
            pageNumber,
            sectionType,
            fieldLabel: header,
            boundingBox: cell.boundingBox || table.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
            surroundingContext: `Row ${rowIdx}, ${header}`
          },
          confidence: cell.confidence || table.confidence || 0.8,
          isHandwritten: false
        });
      }
    }

    return values;
  }

  private parseHandwritten(hw: any, pageNumber: number, sectionType: string): ExtractedValue | null {
    const text = hw.text || "";
    if (!text.trim()) return null;

    const numericMatch = text.match(/[-+]?\d*\.?\d+/);
    const numericValue = numericMatch ? parseFloat(numericMatch[0]) : null;
    const unit = this.extractUnit(text);
    const valueType = this.determineValueType(text);

    return {
      id: this.generateValueId(),
      rawValue: text,
      numericValue,
      unit,
      valueType,
      source: {
        pageNumber,
        sectionType,
        fieldLabel: hw.nearbyLabel || "Handwritten entry",
        boundingBox: hw.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
        surroundingContext: hw.nearbyLabel || "Handwritten"
      },
      confidence: hw.confidence || 0.7,
      isHandwritten: true
    };
  }

  private parseTextForValues(text: string, pageNumber: number, sectionType: string): ExtractedValue[] {
    const values: ExtractedValue[] = [];
    
    const patterns = [
      { regex: /(?:yield|recovery)\s*[:\s]*(\d+\.?\d*)\s*%/gi, label: "Yield" },
      { regex: /(?:temperature|temp)\s*[:\s]*(\d+\.?\d*)\s*°?[CF]?/gi, label: "Temperature" },
      { regex: /(?:pressure|psi)\s*[:\s]*(\d+\.?\d*)\s*(?:psi|bar|kpa)?/gi, label: "Pressure" },
      { regex: /(?:ph|pH)\s*[:\s]*(\d+\.?\d*)/gi, label: "pH" },
      { regex: /(?:volume|vol)\s*[:\s]*(\d+\.?\d*)\s*(?:ml|l|L|mL)?/gi, label: "Volume" },
      { regex: /(?:weight|wt)\s*[:\s]*(\d+\.?\d*)\s*(?:kg|g|mg)?/gi, label: "Weight" },
      { regex: /(?:time|duration)\s*[:\s]*(\d+\.?\d*)\s*(?:hr|hrs|hours?|min|minutes?)?/gi, label: "Time" },
      { regex: /(?:flow\s*rate)\s*[:\s]*(\d+\.?\d*)\s*(?:ml\/min|L\/min)?/gi, label: "Flow Rate" },
      { regex: /batch\s*(?:no|#|number)\s*[:\s]*([A-Z0-9-]+)/gi, label: "Batch Number" },
      { regex: /lot\s*(?:no|#|number)\s*[:\s]*([A-Z0-9-]+)/gi, label: "Lot Number" },
      { regex: /equipment\s*(?:id|#|number)\s*[:\s]*([A-Z0-9-]+)/gi, label: "Equipment ID" },
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        const rawValue = match[0];
        const capturedValue = match[1];
        const numericValue = parseFloat(capturedValue);
        
        if (!isNaN(numericValue) || capturedValue) {
          values.push({
            id: this.generateValueId(),
            rawValue,
            numericValue: isNaN(numericValue) ? null : numericValue,
            unit: this.extractUnit(rawValue),
            valueType: isNaN(numericValue) ? "text" : "numeric",
            source: {
              pageNumber,
              sectionType,
              fieldLabel: pattern.label,
              boundingBox: { x: 0, y: 0, width: 0, height: 0 },
              surroundingContext: text.substring(Math.max(0, match.index - 50), Math.min(text.length, match.index + 50))
            },
            confidence: 0.6,
            isHandwritten: false
          });
        }
      }
    }

    return values;
  }

  private extractUnit(text: string): string | null {
    const unitPatterns = [
      { pattern: /°[CF]/i, unit: text.match(/°[CF]/i)?.[0] || null },
      { pattern: /\b(psi|bar|kpa|mbar)\b/i, unit: null },
      { pattern: /\b(ml|l|mL|L|liters?)\b/i, unit: null },
      { pattern: /\b(kg|g|mg|grams?|kilograms?)\b/i, unit: null },
      { pattern: /\b(hrs?|hours?|min|minutes?|sec|seconds?)\b/i, unit: null },
      { pattern: /\b(ml\/min|L\/min|gpm)\b/i, unit: null },
      { pattern: /%/g, unit: "%" },
    ];

    for (const { pattern } of unitPatterns) {
      const match = text.match(pattern);
      if (match) return match[0].toLowerCase();
    }

    return null;
  }

  private determineValueType(text: string): "numeric" | "date" | "time" | "datetime" | "text" | "boolean" {
    if (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(text)) {
      if (/\d{1,2}:\d{2}/.test(text)) return "datetime";
      return "date";
    }
    if (/\d{1,2}:\d{2}(:\d{2})?(\s*[AP]M)?/i.test(text)) return "time";
    if (/^(yes|no|true|false|pass|fail|y|n)$/i.test(text.trim())) return "boolean";
    if (/[-+]?\d*\.?\d+/.test(text)) return "numeric";
    return "text";
  }

  private detectFormulas(
    values: ExtractedValue[],
    pageNumber: number,
    sectionType: string
  ): DetectedFormula[] {
    const formulas: DetectedFormula[] = [];

    const yieldFormula = this.detectYieldFormula(values, pageNumber, sectionType);
    if (yieldFormula) formulas.push(yieldFormula);

    const reconciliationFormula = this.detectReconciliationFormula(values, pageNumber, sectionType);
    if (reconciliationFormula) formulas.push(reconciliationFormula);

    const tempAvgFormula = this.detectTemperatureAverageFormula(values, pageNumber, sectionType);
    if (tempAvgFormula) formulas.push(tempAvgFormula);

    const holdTimeFormula = this.detectHoldTimeFormula(values, pageNumber, sectionType);
    if (holdTimeFormula) formulas.push(holdTimeFormula);

    const pressureDiffFormula = this.detectPressureDifferentialFormula(values, pageNumber, sectionType);
    if (pressureDiffFormula) formulas.push(pressureDiffFormula);

    return formulas;
  }

  private detectYieldFormula(
    values: ExtractedValue[],
    pageNumber: number,
    sectionType: string
  ): DetectedFormula | null {
    const outputValue = values.find(v => 
      /output|product|final|filled/i.test(v.source.fieldLabel) &&
      v.numericValue !== null
    );
    const inputValue = values.find(v => 
      /input|initial|starting|bulk/i.test(v.source.fieldLabel) &&
      v.numericValue !== null
    );
    const yieldValue = values.find(v => 
      /yield|recovery/i.test(v.source.fieldLabel) &&
      v.numericValue !== null
    );

    if (outputValue && inputValue && inputValue.numericValue && inputValue.numericValue > 0) {
      const expectedYield = (outputValue.numericValue! / inputValue.numericValue) * 100;
      const tolerance = 0.5;
      const discrepancy = yieldValue ? Math.abs(expectedYield - yieldValue.numericValue!) : null;
      const isWithinTolerance = discrepancy !== null ? discrepancy <= tolerance : true;

      return {
        id: this.generateFormulaId(),
        formulaType: "yield_percentage",
        formulaExpression: "(Output / Input) × 100",
        operands: [
          { name: "Output", value: outputValue, role: "numerator" },
          { name: "Input", value: inputValue, role: "denominator" }
        ],
        expectedResult: Math.round(expectedYield * 100) / 100,
        actualResult: yieldValue || null,
        discrepancy: discrepancy !== null ? Math.round(discrepancy * 100) / 100 : null,
        tolerancePercent: tolerance,
        isWithinTolerance,
        source: yieldValue?.source || outputValue.source
      };
    }

    return null;
  }

  private detectReconciliationFormula(
    values: ExtractedValue[],
    pageNumber: number,
    sectionType: string
  ): DetectedFormula | null {
    const inputValue = values.find(v => 
      /input|received|starting|issued/i.test(v.source.fieldLabel) &&
      v.numericValue !== null
    );
    const usedValue = values.find(v => 
      /used|consumed|filled/i.test(v.source.fieldLabel) &&
      v.numericValue !== null
    );
    const wasteValue = values.find(v => 
      /waste|reject|discard/i.test(v.source.fieldLabel) &&
      v.numericValue !== null
    );
    const remainingValue = values.find(v => 
      /remaining|balance|returned/i.test(v.source.fieldLabel) &&
      v.numericValue !== null
    );

    if (inputValue && inputValue.numericValue !== null) {
      const used = usedValue?.numericValue || 0;
      const waste = wasteValue?.numericValue || 0;
      const remaining = remainingValue?.numericValue || 0;
      
      const expectedTotal = used + waste + remaining;
      const actualTotal = inputValue.numericValue;
      const tolerance = 0.1;
      const discrepancy = Math.abs(actualTotal - expectedTotal);
      const isWithinTolerance = discrepancy <= (actualTotal * tolerance / 100);

      const operands: DetectedFormula["operands"] = [
        { name: "Input", value: inputValue, role: "base" }
      ];
      if (usedValue) operands.push({ name: "Used", value: usedValue, role: "operand" });
      if (wasteValue) operands.push({ name: "Waste", value: wasteValue, role: "operand" });
      if (remainingValue) operands.push({ name: "Remaining", value: remainingValue, role: "operand" });

      return {
        id: this.generateFormulaId(),
        formulaType: "material_reconciliation",
        formulaExpression: "Input = Used + Waste + Remaining",
        operands,
        expectedResult: Math.round(expectedTotal * 100) / 100,
        actualResult: inputValue,
        discrepancy: Math.round(discrepancy * 100) / 100,
        tolerancePercent: tolerance,
        isWithinTolerance,
        source: inputValue.source
      };
    }

    return null;
  }

  private detectTemperatureAverageFormula(
    values: ExtractedValue[],
    pageNumber: number,
    sectionType: string
  ): DetectedFormula | null {
    const tempValues = values.filter(v => 
      /temp/i.test(v.source.fieldLabel) &&
      v.numericValue !== null &&
      !/avg|average|mean/i.test(v.source.fieldLabel)
    );
    
    const avgTempValue = values.find(v => 
      /avg|average|mean/i.test(v.source.fieldLabel) &&
      /temp/i.test(v.source.fieldLabel) &&
      v.numericValue !== null
    );

    if (tempValues.length >= 2 && avgTempValue) {
      const sum = tempValues.reduce((acc, v) => acc + (v.numericValue || 0), 0);
      const expectedAvg = sum / tempValues.length;
      const tolerance = 0.5;
      const discrepancy = Math.abs(expectedAvg - avgTempValue.numericValue!);
      const isWithinTolerance = discrepancy <= tolerance;

      return {
        id: this.generateFormulaId(),
        formulaType: "temperature_average",
        formulaExpression: `Sum of temperatures / ${tempValues.length}`,
        operands: tempValues.map((v, idx) => ({ 
          name: `Temp ${idx + 1}`, 
          value: v, 
          role: "operand" as const
        })),
        expectedResult: Math.round(expectedAvg * 100) / 100,
        actualResult: avgTempValue,
        discrepancy: Math.round(discrepancy * 100) / 100,
        tolerancePercent: tolerance,
        isWithinTolerance,
        source: avgTempValue.source
      };
    }

    return null;
  }

  private detectHoldTimeFormula(
    values: ExtractedValue[],
    pageNumber: number,
    sectionType: string
  ): DetectedFormula | null {
    const startTime = values.find(v => 
      /start|begin/i.test(v.source.fieldLabel) &&
      (v.valueType === "time" || v.valueType === "datetime")
    );
    const endTime = values.find(v => 
      /end|stop|finish/i.test(v.source.fieldLabel) &&
      (v.valueType === "time" || v.valueType === "datetime")
    );
    const holdTime = values.find(v => 
      /hold.*time|duration/i.test(v.source.fieldLabel) &&
      v.numericValue !== null
    );

    if (startTime && endTime && holdTime) {
      return {
        id: this.generateFormulaId(),
        formulaType: "hold_time",
        formulaExpression: "End Time - Start Time",
        operands: [
          { name: "Start Time", value: startTime, role: "subtrahend" },
          { name: "End Time", value: endTime, role: "base" }
        ],
        expectedResult: holdTime.numericValue || 0,
        actualResult: holdTime,
        discrepancy: null,
        tolerancePercent: 0.5,
        isWithinTolerance: true,
        source: holdTime.source
      };
    }

    return null;
  }

  private detectPressureDifferentialFormula(
    values: ExtractedValue[],
    pageNumber: number,
    sectionType: string
  ): DetectedFormula | null {
    const inletPressure = values.find(v => 
      /inlet|input|upstream/i.test(v.source.fieldLabel) &&
      /pressure/i.test(v.source.fieldLabel) &&
      v.numericValue !== null
    );
    const outletPressure = values.find(v => 
      /outlet|output|downstream/i.test(v.source.fieldLabel) &&
      /pressure/i.test(v.source.fieldLabel) &&
      v.numericValue !== null
    );
    const diffPressure = values.find(v => 
      /diff|delta|drop/i.test(v.source.fieldLabel) &&
      /pressure/i.test(v.source.fieldLabel) &&
      v.numericValue !== null
    );

    if (inletPressure && outletPressure && inletPressure.numericValue !== null && outletPressure.numericValue !== null) {
      const expectedDiff = Math.abs(inletPressure.numericValue - outletPressure.numericValue);
      const tolerance = 0.5;
      const discrepancy = diffPressure ? Math.abs(expectedDiff - diffPressure.numericValue!) : null;
      const isWithinTolerance = discrepancy !== null ? discrepancy <= tolerance : true;

      return {
        id: this.generateFormulaId(),
        formulaType: "pressure_differential",
        formulaExpression: "|Inlet Pressure - Outlet Pressure|",
        operands: [
          { name: "Inlet Pressure", value: inletPressure, role: "base" },
          { name: "Outlet Pressure", value: outletPressure, role: "subtrahend" }
        ],
        expectedResult: Math.round(expectedDiff * 100) / 100,
        actualResult: diffPressure || null,
        discrepancy: discrepancy !== null ? Math.round(discrepancy * 100) / 100 : null,
        tolerancePercent: tolerance,
        isWithinTolerance,
        source: diffPressure?.source || inletPressure.source
      };
    }

    return null;
  }

  private applyRules(
    values: ExtractedValue[],
    sectionType: string,
    pageNumber: number
  ): ValidationAlert[] {
    const alerts: ValidationAlert[] = [];

    for (const rule of this.sopRules) {
      if (!rule.enabled) continue;

      for (const condition of rule.conditions) {
        if (!condition.sectionTypes.includes(sectionType)) continue;

        const regex = new RegExp(condition.fieldPattern, "i");
        const matchingValues = values.filter(v => regex.test(v.source.fieldLabel));

        for (const value of matchingValues) {
          const violation = this.checkCondition(value, condition);
          
          if (violation) {
            alerts.push({
              id: this.generateAlertId(),
              category: rule.category,
              severity: rule.severity,
              title: rule.name,
              message: rule.errorMessage,
              details: `${value.source.fieldLabel}: ${value.rawValue}`,
              source: value.source,
              relatedValues: [value],
              suggestedAction: rule.suggestedAction,
              ruleId: rule.id,
              formulaId: null,
              isResolved: false,
              resolvedBy: null,
              resolvedAt: null,
              resolution: null
            });
          }
        }

        if (condition.operator === "exists" && matchingValues.length === 0) {
          alerts.push({
            id: this.generateAlertId(),
            category: rule.category,
            severity: rule.severity,
            title: rule.name,
            message: rule.errorMessage,
            details: `Expected field matching pattern: ${condition.fieldPattern}`,
            source: {
              pageNumber,
              sectionType,
              fieldLabel: condition.fieldPattern,
              boundingBox: { x: 0, y: 0, width: 0, height: 0 },
              surroundingContext: ""
            },
            relatedValues: [],
            suggestedAction: rule.suggestedAction,
            ruleId: rule.id,
            formulaId: null,
            isResolved: false,
            resolvedBy: null,
            resolvedAt: null,
            resolution: null
          });
        }
      }
    }

    return alerts;
  }

  private checkCondition(
    value: ExtractedValue,
    condition: SOPRule["conditions"][0]
  ): boolean {
    const numValue = value.numericValue;

    switch (condition.operator) {
      case "greater_than":
        return numValue !== null && numValue < (condition.value as number);
      case "less_than":
        return numValue !== null && numValue > (condition.value as number);
      case "between":
        const [min, max] = condition.value as [number, number];
        return numValue !== null && (numValue < min || numValue > max);
      case "equals":
        return value.rawValue !== String(condition.value);
      case "not_equals":
        return value.rawValue === String(condition.value);
      case "contains":
        return !value.rawValue.toLowerCase().includes(String(condition.value).toLowerCase());
      case "exists":
        return false;
      case "not_exists":
        return true;
      default:
        return false;
    }
  }

  private createFormulaAlert(formula: DetectedFormula): ValidationAlert {
    const formulaNames: Record<FormulaType, string> = {
      yield_percentage: "Yield Calculation",
      material_reconciliation: "Material Reconciliation",
      hold_time: "Hold Time Calculation",
      temperature_average: "Temperature Average",
      flow_volume: "Flow Volume Calculation",
      pressure_differential: "Pressure Differential",
      filter_integrity: "Filter Integrity",
      concentration: "Concentration Calculation",
      weight_difference: "Weight Difference",
      time_duration: "Time Duration",
      custom: "Custom Formula"
    };

    return {
      id: this.generateAlertId(),
      category: "calculation_error",
      severity: formula.discrepancy && formula.discrepancy > 5 ? "high" : "medium",
      title: `Incorrect ${formulaNames[formula.formulaType]}`,
      message: `${formulaNames[formula.formulaType]} discrepancy detected on Page ${formula.source.pageNumber}`,
      details: `Expected: ${formula.expectedResult}, Actual: ${formula.actualResult?.numericValue ?? "N/A"}, Discrepancy: ${formula.discrepancy}${formula.actualResult?.unit || ""}`,
      source: formula.source,
      relatedValues: formula.operands.map(o => o.value),
      suggestedAction: "Verify calculation inputs and recalculate",
      ruleId: null,
      formulaId: formula.id,
      isResolved: false,
      resolvedBy: null,
      resolvedAt: null,
      resolution: null
    };
  }

  private validateCrossPageConsistency(pageResults: PageValidationResult[]): ValidationAlert[] {
    const alerts: ValidationAlert[] = [];

    // Check page completeness - verify all declared pages are present
    const pageCompletenessAlerts = this.checkPageCompleteness(pageResults);
    alerts.push(...pageCompletenessAlerts);

    // Check batch number consistency using parallel structured + raw text extraction
    const batchNumberAlerts = this.checkBatchNumberConsistency(pageResults);
    alerts.push(...batchNumberAlerts);

    // Check lot number consistency using parallel structured + raw text extraction
    const lotNumberAlerts = this.checkLotNumberConsistency(pageResults);
    alerts.push(...lotNumberAlerts);

    const timestamps = this.collectTimestamps(pageResults);
    const sequenceErrors = this.validateChronologicalOrder(timestamps);
    alerts.push(...sequenceErrors);

    return alerts;
  }

  /**
   * Normalize a serial identifier (batch number, lot number) to handle common OCR confusions.
   * This allows fuzzy matching of values that are the same but OCR read differently.
   * 
   * Handles:
   * - I ↔ 1 (letter I vs digit one)
   * - O ↔ 0 (letter O vs digit zero)
   * - ( → C (parenthesis misread as C at start)
   * - Removes spaces
   * - Uppercase normalization
   * 
   * @param value - The raw value to normalize
   * @returns Object with normalized (canonical) value and original value
   */
  private normalizeSerialIdentifier(value: string): { canonical: string; original: string } {
    const original = value.trim().toUpperCase();
    
    let canonical = original
      // Remove all spaces
      .replace(/\s+/g, '')
      // Replace opening parenthesis with C (common OCR confusion at start)
      .replace(/^\(/, 'C')
      // Replace letter I with digit 1 (very common OCR confusion)
      .replace(/I/g, '1')
      // Replace letter O with digit 0 (common OCR confusion)
      .replace(/O/g, '0');
    
    return { canonical, original };
  }

  /**
   * Resolve majority value from a set of values across pages using frequency analysis.
   * Implements majority-voting logic to determine the "expected" correct value.
   * Uses OCR-aware normalization to group visually similar values together.
   * 
   * @param valueLabel - Label for the value type (e.g., "Batch Number", "Lot Number")
   * @param values - Array of values with their page numbers and sources
   * @returns Majority analysis result with expected value, outliers, and confidence
   */
  private resolveMajorityValue(
    valueLabel: string,
    values: Array<{
      value: string;
      pageNumber: number;
      source: SourceLocation;
      sourceType: "structured" | "text-derived";
      confidence: "high" | "medium" | "low";
    }>
  ): {
    hasMajority: boolean;
    expectedValue: string | null;
    majorityCount: number;
    totalCount: number;
    confidenceTier: "high" | "medium" | "low";
    outlierPages: Array<{
      pageNumber: number;
      foundValue: string;
      source: SourceLocation;
      sourceType: "structured" | "text-derived";
    }>;
    isTie: boolean;
    tiedValues: string[];
    allValues: Map<string, Array<{ pageNumber: number; source: SourceLocation; sourceType: "structured" | "text-derived"; originalValue: string }>>;
  } {
    // Count frequency of each normalized value using OCR-aware canonicalization
    // This groups values like "C251RH4004", "C25IRH4004", "(25IRH 4004" together
    const frequencyMap = new Map<string, Array<{
      pageNumber: number;
      source: SourceLocation;
      sourceType: "structured" | "text-derived";
      originalValue: string; // Keep original for display
    }>>();
    
    for (const item of values) {
      // Use OCR-aware normalization to handle I↔1, O↔0, (→C, spaces
      const { canonical, original } = this.normalizeSerialIdentifier(item.value);
      if (!frequencyMap.has(canonical)) {
        frequencyMap.set(canonical, []);
      }
      frequencyMap.get(canonical)!.push({
        pageNumber: item.pageNumber,
        source: item.source,
        sourceType: item.sourceType,
        originalValue: original // Store original for audit
      });
    }

    const totalCount = values.length;
    
    // No values found
    if (totalCount === 0) {
      return {
        hasMajority: false,
        expectedValue: null,
        majorityCount: 0,
        totalCount: 0,
        confidenceTier: "low",
        outlierPages: [],
        isTie: false,
        tiedValues: [],
        allValues: frequencyMap
      };
    }

    // Find maximum frequency
    let maxCount = 0;
    let maxValue: string | null = null;
    const valuesWithMaxCount: string[] = [];

    for (const [value, entries] of Array.from(frequencyMap.entries())) {
      if (entries.length > maxCount) {
        maxCount = entries.length;
        maxValue = value;
        valuesWithMaxCount.length = 0;
        valuesWithMaxCount.push(value);
      } else if (entries.length === maxCount) {
        valuesWithMaxCount.push(value);
      }
    }

    // Check for tie (multiple values with same max frequency)
    const isTie = valuesWithMaxCount.length > 1;
    
    // Calculate confidence tier based on majority percentage
    const majorityPercentage = (maxCount / totalCount) * 100;
    let confidenceTier: "high" | "medium" | "low";
    if (majorityPercentage >= 80) {
      confidenceTier = "high";
    } else if (majorityPercentage >= 50) {
      confidenceTier = "medium";
    } else {
      confidenceTier = "low";
    }

    // If there's a tie, we can't determine a clear majority
    if (isTie) {
      return {
        hasMajority: false,
        expectedValue: null,
        majorityCount: maxCount,
        totalCount,
        confidenceTier: "low",
        outlierPages: [],
        isTie: true,
        tiedValues: valuesWithMaxCount,
        allValues: frequencyMap
      };
    }

    // Identify outlier pages (pages with non-majority canonical values)
    // Use original value for display, canonical for comparison
    const outlierPages: Array<{
      pageNumber: number;
      foundValue: string;
      source: SourceLocation;
      sourceType: "structured" | "text-derived";
    }> = [];

    for (const [canonicalValue, entries] of Array.from(frequencyMap.entries())) {
      if (canonicalValue !== maxValue) {
        for (const entry of entries) {
          outlierPages.push({
            pageNumber: entry.pageNumber,
            foundValue: entry.originalValue, // Use original value for display
            source: entry.source,
            sourceType: entry.sourceType
          });
        }
      }
    }

    // Sort outliers by page number for consistent output
    outlierPages.sort((a, b) => a.pageNumber - b.pageNumber);

    return {
      hasMajority: true,
      expectedValue: maxValue,
      majorityCount: maxCount,
      totalCount,
      confidenceTier,
      outlierPages,
      isTie: false,
      tiedValues: [],
      allValues: frequencyMap
    };
  }

  /**
   * Check if a field label looks like a batch number field, handling OCR typos.
   * Matches patterns like "Batch No", "Butch No." (OCR error), "Batch Number", "Batch No./Date".
   * Rejects fields like "Batch Notes", "Batch No Verified" that are not number fields.
   */
  private isBatchNumberField(fieldLabel: string): boolean {
    const label = fieldLabel.toLowerCase().trim();
    
    // Word patterns that should match - only close typos of "batch" (edit distance ~1)
    const batchWords = [
      "batch",   // correct
      "butch",   // common OCR: a→u
      "betch",   // OCR: a→e
      "botch",   // OCR: a→o
      "balch",   // OCR: t→l
      "bateh",   // OCR: c→e
      "barch",   // OCR: tc→rc
      "8atch",   // OCR: b→8
      "ba1ch",   // OCR: t→1
    ];
    
    // Build patterns for each batch word
    for (const word of batchWords) {
      // Pattern 1: "Batch No." or "Batch No.:" - period required, allows colon or end
      if (new RegExp(`^${word}\\s*no\\.\\s*:?\\s*$`, 'i').test(label)) return true;
      // "Batch No. / Date" or "Batch No./Date" - period + optional whitespace + separator
      if (new RegExp(`^${word}\\s*no\\.\\s*[/&(]`, 'i').test(label)) return true;
      
      // Pattern 2: "Batch No" or "Batch No:" - ends with no/colon, not "Notes"
      if (new RegExp(`^${word}\\s*no\\s*:?\\s*$`, 'i').test(label)) return true;
      // "Batch No / Date" or "Batch No/Date" or "Batch No & Expiry" - optional whitespace + separator
      if (new RegExp(`^${word}\\s*no\\s*[/&(]`, 'i').test(label)) return true;
      
      // Pattern 3: "Batch Number" - ends or has separator
      if (new RegExp(`^${word}\\s*number\\s*:?\\s*$`, 'i').test(label)) return true;
      if (new RegExp(`^${word}\\s*number\\s*[/&(]`, 'i').test(label)) return true;
      
      // Pattern 4: "Batch #" - ends or has separator
      if (new RegExp(`^${word}\\s*#\\s*:?\\s*$`, 'i').test(label)) return true;
      if (new RegExp(`^${word}\\s*#\\s*[/&(]`, 'i').test(label)) return true;
      
      // Pattern 5: Just "Batch" or "Batch:" at end
      if (new RegExp(`^${word}\\s*:?\\s*$`, 'i').test(label)) return true;
    }
    
    return false;
  }

  /**
   * Scan raw text for batch number patterns and extract value if present.
   * Handles OCR typos like "Butch No.:" and returns the value (or empty if label found but no value).
   * Iterates through ALL label matches on the page and returns the first valid value found.
   * If labels exist but all have empty values, returns { label, value: "" } to trigger missing alert.
   */
  private scanTextForBatchNumber(text: string, pageNumber: number): { label: string; value: string } | null {
    if (!text) return null;
    
    // OCR variants of "batch"
    const batchWords = ["batch", "butch", "betch", "botch", "balch", "bateh", "barch", "8atch", "ba1ch"];
    
    let firstLabelFound: string | null = null;
    
    for (const word of batchWords) {
      // Find all batch label patterns in the text
      const labelPatterns = [
        new RegExp(`(${word}\\s*no\\.?)\\s*:?`, 'gi'),
        new RegExp(`(${word}\\s*number)\\s*:?`, 'gi'),
        new RegExp(`(${word}\\s*#)\\s*:?`, 'gi'),
      ];
      
      for (const labelPattern of labelPatterns) {
        let match;
        // Reset lastIndex for each pattern
        labelPattern.lastIndex = 0;
        
        while ((match = labelPattern.exec(text)) !== null) {
          const label = match[1].trim();
          if (!firstLabelFound) firstLabelFound = label;
          
          const afterLabel = text.substring(match.index + match[0].length);
          
          // Check same line and next line for value
          const lines = afterLabel.split('\n');
          const linesToCheck = [lines[0], lines[1] || ""].join(" ").trim();
          
          // Get whitespace-separated tokens
          const tokens = linesToCheck.split(/\s+/);
          
          for (const rawToken of tokens) {
            if (!rawToken) continue;
            
            // Strip leading/trailing punctuation that OCR often appends
            const token = rawToken.replace(/^[,;:.\s]+|[,;:.\s]+$/g, '');
            if (!token) continue;
            
            // Stop if we hit another field label
            if (/^(lot|lat|lct|1ot|l0t|effective|date|revision|page|document|expiry|copy|sign)/i.test(token)) {
              break;
            }
            
            // A valid batch number contains at least one digit and is alphanumeric
            if (/\d/.test(token) && /^[A-Za-z0-9\-\/]+$/.test(token)) {
              return { label, value: token };
            }
          }
        }
      }
    }
    
    // If we found at least one label but no valid value, return empty value
    // This will trigger "Batch Number Missing" alert
    if (firstLabelFound) {
      return { label: firstLabelFound, value: "" };
    }
    
    return null;
  }

  /**
   * Check if all pages have the same batch number using BOTH structured form fields AND raw text scanning in parallel.
   * Reconciles results from both sources to maximize accuracy and detect discrepancies.
   * 
   * Source priority:
   * 1. If both agree → high confidence, use structured (has position data)
   * 2. If structured has value, raw text empty → use structured
   * 3. If structured empty, raw text has value → use raw text (text-derived)
   * 4. If both have DIFFERENT values → reconciliation alert for human review
   */
  private checkBatchNumberConsistency(pageResults: PageValidationResult[]): ValidationAlert[] {
    const alerts: ValidationAlert[] = [];
    
    // Track batch values with their source type for cross-page comparison
    const batchValuesFound: Array<{ 
      value: string; 
      pageNumber: number; 
      source: SourceLocation;
      sourceType: "structured" | "text-derived";
      confidence: "high" | "medium" | "low";
    }> = [];
    const emptyBatchFields: Array<{ pageNumber: number; source: SourceLocation; label: string }> = [];
    const reconciliationIssues: Array<{ 
      pageNumber: number; 
      structuredValue: string; 
      textValue: string;
      structuredLabel: string;
      textLabel: string;
    }> = [];

    for (const page of pageResults) {
      // === PARALLEL EXTRACTION: Run BOTH sources for every page ===
      
      // Source 1: Structured form fields
      let structuredResult: { value: string; label: string; source: SourceLocation } | null = null;
      for (const extractedValue of page.extractedValues) {
        const fieldLabel = extractedValue.source.fieldLabel;
        if (this.isBatchNumberField(fieldLabel)) {
          structuredResult = {
            value: extractedValue.rawValue.trim().toUpperCase(),
            label: fieldLabel,
            source: extractedValue.source
          };
          break; // Use first batch field found in structured data
        }
      }
      
      // Source 2: Raw text scanning (always run, not just as fallback)
      let textResult: { value: string; label: string } | null = null;
      if (page.extractedText) {
        const scanned = this.scanTextForBatchNumber(page.extractedText, page.pageNumber);
        if (scanned) {
          textResult = {
            value: scanned.value.toUpperCase(),
            label: scanned.label
          };
        }
      }
      
      // === RECONCILIATION: Compare and decide ===
      const textSource: SourceLocation = {
        pageNumber: page.pageNumber,
        sectionType: "",
        fieldLabel: textResult?.label || "Batch No",
        boundingBox: { x: 0, y: 0, width: 0, height: 0 },
        surroundingContext: `Found in raw text: "${textResult?.label || ""}"`
      };
      
      if (structuredResult && textResult) {
        // Both sources found batch labels
        const structuredHasValue = !!structuredResult.value;
        const textHasValue = !!textResult.value;
        
        if (structuredHasValue && textHasValue) {
          // Both have values - compare them
          if (structuredResult.value === textResult.value) {
            // MATCH: High confidence - both sources agree
            batchValuesFound.push({
              value: structuredResult.value,
              pageNumber: page.pageNumber,
              source: structuredResult.source,
              sourceType: "structured",
              confidence: "high"
            });
          } else {
            // MISMATCH: Reconciliation needed - flag for human review
            reconciliationIssues.push({
              pageNumber: page.pageNumber,
              structuredValue: structuredResult.value,
              textValue: textResult.value,
              structuredLabel: structuredResult.label,
              textLabel: textResult.label
            });
            // Still add structured value for cross-page comparison but mark as low confidence
            batchValuesFound.push({
              value: structuredResult.value,
              pageNumber: page.pageNumber,
              source: structuredResult.source,
              sourceType: "structured",
              confidence: "low"
            });
          }
        } else if (structuredHasValue) {
          // Only structured has value - use it
          batchValuesFound.push({
            value: structuredResult.value,
            pageNumber: page.pageNumber,
            source: structuredResult.source,
            sourceType: "structured",
            confidence: "medium"
          });
        } else if (textHasValue) {
          // Only raw text has value - use it as text-derived
          batchValuesFound.push({
            value: textResult.value,
            pageNumber: page.pageNumber,
            source: { ...textSource, surroundingContext: `Text-derived from: "${textResult.label}"` },
            sourceType: "text-derived",
            confidence: "medium"
          });
        } else {
          // Both labels found but both empty - missing value
          emptyBatchFields.push({
            pageNumber: page.pageNumber,
            source: structuredResult.source,
            label: structuredResult.label
          });
        }
      } else if (structuredResult) {
        // Only structured source found
        if (structuredResult.value) {
          batchValuesFound.push({
            value: structuredResult.value,
            pageNumber: page.pageNumber,
            source: structuredResult.source,
            sourceType: "structured",
            confidence: "medium"
          });
        } else {
          emptyBatchFields.push({
            pageNumber: page.pageNumber,
            source: structuredResult.source,
            label: structuredResult.label
          });
        }
      } else if (textResult) {
        // Only raw text source found
        if (textResult.value) {
          batchValuesFound.push({
            value: textResult.value,
            pageNumber: page.pageNumber,
            source: textSource,
            sourceType: "text-derived",
            confidence: "medium"
          });
        } else {
          emptyBatchFields.push({
            pageNumber: page.pageNumber,
            source: textSource,
            label: textResult.label
          });
        }
      }
      // If neither source found batch labels, page has no batch field - skip
    }

    // === GENERATE ALERTS ===
    
    // Alert 1: Reconciliation issues (structured vs text disagreement)
    if (reconciliationIssues.length > 0) {
      const details = reconciliationIssues.map(issue => 
        `Page ${issue.pageNumber}: Structured field "${issue.structuredLabel}" = "${issue.structuredValue}" vs Raw text "${issue.textLabel}" = "${issue.textValue}"`
      ).join("; ");
      
      alerts.push({
        id: this.generateAlertId(),
        category: "data_quality",
        severity: "high",
        title: "Batch Number Extraction Discrepancy",
        message: `Structured form extraction and raw text scanning found different batch numbers on ${reconciliationIssues.length} page(s). Manual verification required.`,
        details,
        source: reconciliationIssues[0] ? {
          pageNumber: reconciliationIssues[0].pageNumber,
          sectionType: "",
          fieldLabel: reconciliationIssues[0].structuredLabel,
          boundingBox: { x: 0, y: 0, width: 0, height: 0 },
          surroundingContext: "Reconciliation needed between extraction methods"
        } : { pageNumber: 1, sectionType: "", fieldLabel: "Batch No", boundingBox: { x: 0, y: 0, width: 0, height: 0 }, surroundingContext: "" },
        relatedValues: [],
        suggestedAction: "Review the original document to determine the correct batch number. The discrepancy may indicate OCR errors or form parsing issues.",
        ruleId: null,
        formulaId: null,
        isResolved: false,
        resolvedBy: null,
        resolvedAt: null,
        resolution: null
      });
    }

    // Alert 2: Missing batch numbers - generate alert for EVERY empty batch field
    if (emptyBatchFields.length > 0) {
      // Create individual alerts for each page with empty batch field
      for (const emptyField of emptyBatchFields) {
        alerts.push({
          id: this.generateAlertId(),
          category: "missing_value",
          severity: "critical",
          title: "Batch Number Missing",
          message: `Batch number field "${emptyField.label}" is present but empty on page ${emptyField.pageNumber}. This is a critical field required for batch traceability.`,
          details: `Empty batch number field found: "${emptyField.label}"`,
          source: emptyField.source,
          relatedValues: [],
          suggestedAction: "Enter the batch number for proper document identification and traceability.",
          ruleId: null,
          formulaId: null,
          isResolved: false,
          resolvedBy: null,
          resolvedAt: null,
          resolution: null
        });
      }
    }

    // Alert 3: Cross-page consistency check using majority-voting
    if (batchValuesFound.length > 0) {
      const uniqueValuesSet = new Set(batchValuesFound.map(b => b.value));
      const uniqueValues = Array.from(uniqueValuesSet);

      if (uniqueValues.length > 1) {
        // Multiple different batch numbers - use majority-voting to identify expected value
        const majorityResult = this.resolveMajorityValue("Batch Number", batchValuesFound);
        
        if (majorityResult.isTie) {
          // Tie scenario: multiple values with equal frequency - ambiguous, needs manual review
          const tiedValuesList = majorityResult.tiedValues.join(", ");
          const detailLines: string[] = [];
          for (const [value, entries] of Array.from(majorityResult.allValues.entries())) {
            const pageList = entries.map((e: { pageNumber: number }) => e.pageNumber).join(", ");
            detailLines.push(`"${value}" on page(s): ${pageList}`);
          }
          
          alerts.push({
            id: this.generateAlertId(),
            category: "data_quality",
            severity: "high",
            title: "Ambiguous Batch Number - Manual Review Required",
            message: `Multiple batch numbers appear with equal frequency (${majorityResult.majorityCount} pages each): ${tiedValuesList}. Cannot determine which is correct.`,
            details: detailLines.join("; "),
            source: batchValuesFound[0]?.source || { 
              pageNumber: 1, 
              sectionType: "", 
              fieldLabel: "Batch No", 
              boundingBox: { x: 0, y: 0, width: 0, height: 0 }, 
              surroundingContext: "" 
            },
            relatedValues: [],
            suggestedAction: "Review original documents to determine the correct batch number. This may indicate mixed documents.",
            ruleId: null,
            formulaId: null,
            isResolved: false,
            resolvedBy: null,
            resolvedAt: null,
            resolution: null
          });
        } else if (majorityResult.hasMajority && majorityResult.outlierPages.length > 0) {
          // Clear majority exists - flag outlier pages
          const confidenceLabel = majorityResult.confidenceTier === "high" 
            ? `High confidence (${Math.round((majorityResult.majorityCount / majorityResult.totalCount) * 100)}%)`
            : majorityResult.confidenceTier === "medium"
            ? `Medium confidence (${Math.round((majorityResult.majorityCount / majorityResult.totalCount) * 100)}%)`
            : `Low confidence (${Math.round((majorityResult.majorityCount / majorityResult.totalCount) * 100)}%)`;
          
          // Document-level summary alert
          const outlierSummary = majorityResult.outlierPages.map(o => 
            `Page ${o.pageNumber}: "${o.foundValue}"`
          ).join("; ");
          
          alerts.push({
            id: this.generateAlertId(),
            category: "consistency_error",
            severity: "critical",
            title: "Batch Number Inconsistency Detected",
            message: `Expected batch number "${majorityResult.expectedValue}" (found on ${majorityResult.majorityCount} of ${majorityResult.totalCount} pages). ${majorityResult.outlierPages.length} page(s) have different values.`,
            details: `${confidenceLabel}. Outliers: ${outlierSummary}`,
            source: batchValuesFound[0]?.source || { 
              pageNumber: 1, 
              sectionType: "", 
              fieldLabel: "Batch No", 
              boundingBox: { x: 0, y: 0, width: 0, height: 0 }, 
              surroundingContext: "" 
            },
            relatedValues: [],
            suggestedAction: "Review outlier pages to determine if they belong to a different document or contain transcription errors.",
            ruleId: null,
            formulaId: null,
            isResolved: false,
            resolvedBy: null,
            resolvedAt: null,
            resolution: null
          });
          
          // Individual alerts for each outlier page
          for (const outlier of majorityResult.outlierPages) {
            alerts.push({
              id: this.generateAlertId(),
              category: "consistency_error",
              severity: "high",
              title: "Batch Number Mismatch on Page",
              message: `Page ${outlier.pageNumber} has batch number "${outlier.foundValue}" but expected "${majorityResult.expectedValue}" based on ${majorityResult.majorityCount} other pages.`,
              details: `Source: ${outlier.sourceType}. This page may be from a different document or contain a data entry error.`,
              source: outlier.source,
              relatedValues: [],
              suggestedAction: "Verify this page belongs to the same batch record. If correct, update other pages; if incorrect, separate this page.",
              ruleId: null,
              formulaId: null,
              isResolved: false,
              resolvedBy: null,
              resolvedAt: null,
              resolution: null
            });
          }
        }
      }
    }

    return alerts;
  }

  /**
   * Check if a field label looks like a lot number field, handling OCR typos.
   * Matches patterns like "Lot No", "Lot Number", "Lot No./Date", etc.
   * Rejects fields like "Lot Notes", "Lot No Verified" that are not number fields.
   */
  private isLotNumberField(fieldLabel: string): boolean {
    const label = fieldLabel.toLowerCase().trim();
    
    // Word patterns that should match - only close typos of "lot" (edit distance ~1)
    const lotWords = [
      "lot",   // correct
      "lat",   // OCR: o→a
      "lct",   // OCR: o→c
      "1ot",   // OCR: l→1
      "l0t",   // OCR: o→0
      "lo1",   // OCR: t→1
    ];
    
    // Build patterns for each lot word
    for (const word of lotWords) {
      // Pattern 1: "Lot No." or "Lot No.:" - period required, allows colon or end
      if (new RegExp(`^${word}\\s*no\\.\\s*:?\\s*$`, 'i').test(label)) return true;
      // "Lot No. / Date" or "Lot No./Date" - period + optional whitespace + separator
      if (new RegExp(`^${word}\\s*no\\.\\s*[/&(]`, 'i').test(label)) return true;
      
      // Pattern 2: "Lot No" or "Lot No:" - ends with no/colon, not "Notes"
      if (new RegExp(`^${word}\\s*no\\s*:?\\s*$`, 'i').test(label)) return true;
      // "Lot No / Date" or "Lot No/Date" or "Lot No & Code" - optional whitespace + separator
      if (new RegExp(`^${word}\\s*no\\s*[/&(]`, 'i').test(label)) return true;
      
      // Pattern 3: "Lot Number" - ends or has separator
      if (new RegExp(`^${word}\\s*number\\s*:?\\s*$`, 'i').test(label)) return true;
      if (new RegExp(`^${word}\\s*number\\s*[/&(]`, 'i').test(label)) return true;
      
      // Pattern 4: "Lot #" - ends or has separator
      if (new RegExp(`^${word}\\s*#\\s*:?\\s*$`, 'i').test(label)) return true;
      if (new RegExp(`^${word}\\s*#\\s*[/&(]`, 'i').test(label)) return true;
      
      // Pattern 5: Just "Lot" or "Lot:" at end
      if (new RegExp(`^${word}\\s*:?\\s*$`, 'i').test(label)) return true;
    }
    
    return false;
  }

  /**
   * Scan raw text for lot number patterns and extract value if present.
   * Handles OCR typos like "Lat No.:" and returns the value (or empty if label found but no value).
   * Iterates through ALL label matches on the page and returns the first valid value found.
   * If labels exist but all have empty values, returns { label, value: "" } to trigger missing alert.
   */
  private scanTextForLotNumber(text: string, pageNumber: number): { label: string; value: string } | null {
    if (!text) return null;
    
    // OCR variants of "lot"
    const lotWords = ["lot", "lat", "lct", "1ot", "l0t", "lo1"];
    
    let firstLabelFound: string | null = null;
    
    for (const word of lotWords) {
      // Find all lot label patterns in the text
      const labelPatterns = [
        new RegExp(`(${word}\\s*no\\.?)\\s*:?`, 'gi'),
        new RegExp(`(${word}\\s*number)\\s*:?`, 'gi'),
        new RegExp(`(${word}\\s*#)\\s*:?`, 'gi'),
      ];
      
      for (const labelPattern of labelPatterns) {
        let match;
        // Reset lastIndex for each pattern
        labelPattern.lastIndex = 0;
        
        while ((match = labelPattern.exec(text)) !== null) {
          const label = match[1].trim();
          if (!firstLabelFound) firstLabelFound = label;
          
          const afterLabel = text.substring(match.index + match[0].length);
          
          // Check same line and next line for value
          const lines = afterLabel.split('\n');
          const linesToCheck = [lines[0], lines[1] || ""].join(" ").trim();
          
          // Get whitespace-separated tokens
          const tokens = linesToCheck.split(/\s+/);
          
          for (const rawToken of tokens) {
            if (!rawToken) continue;
            
            // Strip leading/trailing punctuation that OCR often appends
            const token = rawToken.replace(/^[,;:.\s]+|[,;:.\s]+$/g, '');
            if (!token) continue;
            
            // Stop if we hit another field label
            if (/^(batch|butch|betch|effective|date|revision|page|document|expiry|copy|sign)/i.test(token)) {
              break;
            }
            
            // A valid lot number contains at least one digit and is alphanumeric
            if (/\d/.test(token) && /^[A-Za-z0-9\-\/]+$/.test(token)) {
              return { label, value: token };
            }
          }
        }
      }
    }
    
    // If we found at least one label but no valid value, return empty value
    // This will trigger "Lot Number Missing" alert
    if (firstLabelFound) {
      return { label: firstLabelFound, value: "" };
    }
    
    return null;
  }

  /**
   * Check if all pages have the same lot number using BOTH structured form fields AND raw text scanning in parallel.
   * Reconciles results from both sources to maximize accuracy and detect discrepancies.
   */
  private checkLotNumberConsistency(pageResults: PageValidationResult[]): ValidationAlert[] {
    const alerts: ValidationAlert[] = [];
    
    // Track lot values with their source type for cross-page comparison
    const lotValuesFound: Array<{ 
      value: string; 
      pageNumber: number; 
      source: SourceLocation;
      sourceType: "structured" | "text-derived";
      confidence: "high" | "medium" | "low";
    }> = [];
    const emptyLotFields: Array<{ pageNumber: number; source: SourceLocation; label: string }> = [];
    const reconciliationIssues: Array<{ 
      pageNumber: number; 
      structuredValue: string; 
      textValue: string;
      structuredLabel: string;
      textLabel: string;
    }> = [];

    for (const page of pageResults) {
      // === PARALLEL EXTRACTION: Run BOTH sources for every page ===
      
      // Source 1: Structured form fields
      let structuredResult: { value: string; label: string; source: SourceLocation } | null = null;
      for (const extractedValue of page.extractedValues) {
        const fieldLabel = extractedValue.source.fieldLabel;
        if (this.isLotNumberField(fieldLabel)) {
          structuredResult = {
            value: extractedValue.rawValue.trim().toUpperCase(),
            label: fieldLabel,
            source: extractedValue.source
          };
          break;
        }
      }
      
      // Source 2: Raw text scanning (always run, not just as fallback)
      let textResult: { value: string; label: string } | null = null;
      if (page.extractedText) {
        const scanned = this.scanTextForLotNumber(page.extractedText, page.pageNumber);
        if (scanned) {
          textResult = {
            value: scanned.value.toUpperCase(),
            label: scanned.label
          };
        }
      }
      
      // === RECONCILIATION: Compare and decide ===
      const textSource: SourceLocation = {
        pageNumber: page.pageNumber,
        sectionType: "",
        fieldLabel: textResult?.label || "Lot No",
        boundingBox: { x: 0, y: 0, width: 0, height: 0 },
        surroundingContext: `Found in raw text: "${textResult?.label || ""}"`
      };
      
      if (structuredResult && textResult) {
        const structuredHasValue = !!structuredResult.value;
        const textHasValue = !!textResult.value;
        
        if (structuredHasValue && textHasValue) {
          if (structuredResult.value === textResult.value) {
            // MATCH: High confidence
            lotValuesFound.push({
              value: structuredResult.value,
              pageNumber: page.pageNumber,
              source: structuredResult.source,
              sourceType: "structured",
              confidence: "high"
            });
          } else {
            // MISMATCH: Reconciliation needed
            reconciliationIssues.push({
              pageNumber: page.pageNumber,
              structuredValue: structuredResult.value,
              textValue: textResult.value,
              structuredLabel: structuredResult.label,
              textLabel: textResult.label
            });
            lotValuesFound.push({
              value: structuredResult.value,
              pageNumber: page.pageNumber,
              source: structuredResult.source,
              sourceType: "structured",
              confidence: "low"
            });
          }
        } else if (structuredHasValue) {
          lotValuesFound.push({
            value: structuredResult.value,
            pageNumber: page.pageNumber,
            source: structuredResult.source,
            sourceType: "structured",
            confidence: "medium"
          });
        } else if (textHasValue) {
          lotValuesFound.push({
            value: textResult.value,
            pageNumber: page.pageNumber,
            source: { ...textSource, surroundingContext: `Text-derived from: "${textResult.label}"` },
            sourceType: "text-derived",
            confidence: "medium"
          });
        } else {
          emptyLotFields.push({
            pageNumber: page.pageNumber,
            source: structuredResult.source,
            label: structuredResult.label
          });
        }
      } else if (structuredResult) {
        if (structuredResult.value) {
          lotValuesFound.push({
            value: structuredResult.value,
            pageNumber: page.pageNumber,
            source: structuredResult.source,
            sourceType: "structured",
            confidence: "medium"
          });
        } else {
          emptyLotFields.push({
            pageNumber: page.pageNumber,
            source: structuredResult.source,
            label: structuredResult.label
          });
        }
      } else if (textResult) {
        if (textResult.value) {
          lotValuesFound.push({
            value: textResult.value,
            pageNumber: page.pageNumber,
            source: textSource,
            sourceType: "text-derived",
            confidence: "medium"
          });
        } else {
          emptyLotFields.push({
            pageNumber: page.pageNumber,
            source: textSource,
            label: textResult.label
          });
        }
      }
    }

    // === GENERATE ALERTS ===
    
    // Alert 1: Reconciliation issues
    if (reconciliationIssues.length > 0) {
      const details = reconciliationIssues.map(issue => 
        `Page ${issue.pageNumber}: Structured "${issue.structuredLabel}" = "${issue.structuredValue}" vs Raw text "${issue.textLabel}" = "${issue.textValue}"`
      ).join("; ");
      
      alerts.push({
        id: this.generateAlertId(),
        category: "data_quality",
        severity: "high",
        title: "Lot Number Extraction Discrepancy",
        message: `Structured form extraction and raw text scanning found different lot numbers on ${reconciliationIssues.length} page(s). Manual verification required.`,
        details,
        source: reconciliationIssues[0] ? {
          pageNumber: reconciliationIssues[0].pageNumber,
          sectionType: "",
          fieldLabel: reconciliationIssues[0].structuredLabel,
          boundingBox: { x: 0, y: 0, width: 0, height: 0 },
          surroundingContext: "Reconciliation needed between extraction methods"
        } : { pageNumber: 1, sectionType: "", fieldLabel: "Lot No", boundingBox: { x: 0, y: 0, width: 0, height: 0 }, surroundingContext: "" },
        relatedValues: [],
        suggestedAction: "Review the original document to determine the correct lot number.",
        ruleId: null,
        formulaId: null,
        isResolved: false,
        resolvedBy: null,
        resolvedAt: null,
        resolution: null
      });
    }

    // Alert 2: Missing lot numbers - generate alert for EVERY empty lot field
    if (emptyLotFields.length > 0) {
      // Create individual alerts for each page with empty lot field
      for (const emptyField of emptyLotFields) {
        alerts.push({
          id: this.generateAlertId(),
          category: "missing_value",
          severity: "high",
          title: "Lot Number Missing",
          message: `Lot number field "${emptyField.label}" is present but empty on page ${emptyField.pageNumber}. This field is important for traceability.`,
          details: `Empty lot number field found: "${emptyField.label}"`,
          source: emptyField.source,
          relatedValues: [],
          suggestedAction: "Enter the lot number for proper material tracking.",
          ruleId: null,
          formulaId: null,
          isResolved: false,
          resolvedBy: null,
          resolvedAt: null,
          resolution: null
        });
      }
    }

    // Alert 3: Cross-page consistency check using majority-voting
    if (lotValuesFound.length > 0) {
      const uniqueValuesSet = new Set(lotValuesFound.map(b => b.value));
      const uniqueValues = Array.from(uniqueValuesSet);

      if (uniqueValues.length > 1) {
        // Multiple different lot numbers - use majority-voting to identify expected value
        const majorityResult = this.resolveMajorityValue("Lot Number", lotValuesFound);
        
        if (majorityResult.isTie) {
          // Tie scenario: multiple values with equal frequency - ambiguous, needs manual review
          const tiedValuesList = majorityResult.tiedValues.join(", ");
          const detailLines: string[] = [];
          for (const [value, entries] of Array.from(majorityResult.allValues.entries())) {
            const pageList = entries.map((e: { pageNumber: number }) => e.pageNumber).join(", ");
            detailLines.push(`"${value}" on page(s): ${pageList}`);
          }
          
          alerts.push({
            id: this.generateAlertId(),
            category: "data_quality",
            severity: "high",
            title: "Ambiguous Lot Number - Manual Review Required",
            message: `Multiple lot numbers appear with equal frequency (${majorityResult.majorityCount} pages each): ${tiedValuesList}. Cannot determine which is correct.`,
            details: detailLines.join("; "),
            source: lotValuesFound[0]?.source || { 
              pageNumber: 1, 
              sectionType: "", 
              fieldLabel: "Lot No", 
              boundingBox: { x: 0, y: 0, width: 0, height: 0 }, 
              surroundingContext: "" 
            },
            relatedValues: [],
            suggestedAction: "Review original documents to determine the correct lot number. This may indicate mixed materials.",
            ruleId: null,
            formulaId: null,
            isResolved: false,
            resolvedBy: null,
            resolvedAt: null,
            resolution: null
          });
        } else if (majorityResult.hasMajority && majorityResult.outlierPages.length > 0) {
          // Clear majority exists - flag outlier pages
          const confidenceLabel = majorityResult.confidenceTier === "high" 
            ? `High confidence (${Math.round((majorityResult.majorityCount / majorityResult.totalCount) * 100)}%)`
            : majorityResult.confidenceTier === "medium"
            ? `Medium confidence (${Math.round((majorityResult.majorityCount / majorityResult.totalCount) * 100)}%)`
            : `Low confidence (${Math.round((majorityResult.majorityCount / majorityResult.totalCount) * 100)}%)`;
          
          // Document-level summary alert
          const outlierSummary = majorityResult.outlierPages.map(o => 
            `Page ${o.pageNumber}: "${o.foundValue}"`
          ).join("; ");
          
          alerts.push({
            id: this.generateAlertId(),
            category: "consistency_error",
            severity: "high",
            title: "Lot Number Inconsistency Detected",
            message: `Expected lot number "${majorityResult.expectedValue}" (found on ${majorityResult.majorityCount} of ${majorityResult.totalCount} pages). ${majorityResult.outlierPages.length} page(s) have different values.`,
            details: `${confidenceLabel}. Outliers: ${outlierSummary}`,
            source: lotValuesFound[0]?.source || { 
              pageNumber: 1, 
              sectionType: "", 
              fieldLabel: "Lot No", 
              boundingBox: { x: 0, y: 0, width: 0, height: 0 }, 
              surroundingContext: "" 
            },
            relatedValues: [],
            suggestedAction: "Review outlier pages to determine if they contain incorrect lot numbers or material mix-ups.",
            ruleId: null,
            formulaId: null,
            isResolved: false,
            resolvedBy: null,
            resolvedAt: null,
            resolution: null
          });
          
          // Individual alerts for each outlier page
          for (const outlier of majorityResult.outlierPages) {
            alerts.push({
              id: this.generateAlertId(),
              category: "consistency_error",
              severity: "medium",
              title: "Lot Number Mismatch on Page",
              message: `Page ${outlier.pageNumber} has lot number "${outlier.foundValue}" but expected "${majorityResult.expectedValue}" based on ${majorityResult.majorityCount} other pages.`,
              details: `Source: ${outlier.sourceType}. This page may have an incorrect lot number recorded.`,
              source: outlier.source,
              relatedValues: [],
              suggestedAction: "Verify the lot number on this page is correct.",
              ruleId: null,
              formulaId: null,
              isResolved: false,
              resolvedBy: null,
              resolvedAt: null,
              resolution: null
            });
          }
        }
      }
    }

    return alerts;
  }

  private collectTimestamps(pageResults: PageValidationResult[]): ExtractedValue[] {
    const timestamps: ExtractedValue[] = [];

    for (const page of pageResults) {
      for (const value of page.extractedValues) {
        if (value.valueType === "datetime" || value.valueType === "time") {
          timestamps.push(value);
        }
      }
    }

    return timestamps.sort((a, b) => a.source.pageNumber - b.source.pageNumber);
  }

  private validateChronologicalOrder(timestamps: ExtractedValue[]): ValidationAlert[] {
    const alerts: ValidationAlert[] = [];
    
    return alerts;
  }

  /**
   * Extract page pagination information from OCR text.
   * Looks for patterns like "Page X of Y", "Page X/Y", "X of Y pages", etc.
   * Handles OCR variations and common misspellings.
   * 
   * @param text - Raw OCR text from a page
   * @returns Object with current page number and total pages, or null if not found
   */
  private extractPagePagination(text: string): { currentPage: number; totalPages: number } | null {
    if (!text) return null;
    
    // Common OCR variations of "Page"
    const pageWords = [
      "page",
      "poge",   // OCR: a→o
      "paqe",   // OCR: g→q
      "pa9e",   // OCR: g→9
      "paye",   // OCR: g→y
      "p age",  // OCR: space inserted
    ];
    
    // Build patterns for each page word variant
    for (const word of pageWords) {
      // Pattern 1: "Page X of Y" - most common format
      const pattern1 = new RegExp(`${word}\\s*(\\d+)\\s*(?:of|0f|oF|Of)\\s*(\\d+)`, 'i');
      let match = pattern1.exec(text);
      if (match) {
        const current = parseInt(match[1], 10);
        const total = parseInt(match[2], 10);
        if (current > 0 && total > 0 && current <= total) {
          return { currentPage: current, totalPages: total };
        }
      }
      
      // Pattern 2: "Page X/Y" - slash format
      const pattern2 = new RegExp(`${word}\\s*(\\d+)\\s*/\\s*(\\d+)`, 'i');
      match = pattern2.exec(text);
      if (match) {
        const current = parseInt(match[1], 10);
        const total = parseInt(match[2], 10);
        if (current > 0 && total > 0 && current <= total) {
          return { currentPage: current, totalPages: total };
        }
      }
    }
    
    // Pattern 3: "X of Y" without "Page" prefix (often in headers)
    const standalonePattern = /\b(\d+)\s*(?:of|0f|oF|Of)\s*(\d+)\b/i;
    const standaloneMatch = standalonePattern.exec(text);
    if (standaloneMatch) {
      const current = parseInt(standaloneMatch[1], 10);
      const total = parseInt(standaloneMatch[2], 10);
      // Only accept if numbers look like page numbers (reasonable range)
      if (current > 0 && total > 0 && current <= total && total <= 500) {
        return { currentPage: current, totalPages: total };
      }
    }
    
    return null;
  }

  /**
   * Check document page completeness - verify all expected pages are present.
   * Extracts "Page X of Y" from each page and identifies missing page numbers.
   * 
   * @param pageResults - Array of page validation results with OCR text
   * @returns Array of alerts for missing pages
   */
  private checkPageCompleteness(pageResults: PageValidationResult[]): ValidationAlert[] {
    const alerts: ValidationAlert[] = [];
    
    // Collect pagination info from all pages
    const paginationData: Array<{
      physicalIndex: number;
      declaredPage: number;
      declaredTotal: number;
      source: SourceLocation;
    }> = [];
    
    for (const page of pageResults) {
      if (!page.extractedText) continue;
      
      const pagination = this.extractPagePagination(page.extractedText);
      if (pagination) {
        paginationData.push({
          physicalIndex: page.pageNumber,
          declaredPage: pagination.currentPage,
          declaredTotal: pagination.totalPages,
          source: {
            pageNumber: page.pageNumber,
            sectionType: "header",
            fieldLabel: `Page ${pagination.currentPage} of ${pagination.totalPages}`,
            boundingBox: { x: 0, y: 0, width: 0, height: 0 },
            surroundingContext: `Pagination found in page header`
          }
        });
      }
    }
    
    // If no pagination found on any page, skip this check
    if (paginationData.length === 0) {
      return alerts;
    }
    
    // Determine the expected total (use majority voting if inconsistent)
    const totalCounts = new Map<number, number>();
    for (const item of paginationData) {
      totalCounts.set(item.declaredTotal, (totalCounts.get(item.declaredTotal) || 0) + 1);
    }
    
    // Find the most common declared total
    let expectedTotal = 0;
    let maxCount = 0;
    totalCounts.forEach((count, total) => {
      if (count > maxCount) {
        maxCount = count;
        expectedTotal = total;
      }
    });
    
    if (expectedTotal === 0) {
      return alerts;
    }
    
    // Build set of declared page numbers found
    const foundPages = new Set<number>();
    for (const item of paginationData) {
      foundPages.add(item.declaredPage);
    }
    
    // Find missing pages in the 1 to expectedTotal range
    const missingPages: number[] = [];
    for (let i = 1; i <= expectedTotal; i++) {
      if (!foundPages.has(i)) {
        missingPages.push(i);
      }
    }
    
    // Generate alert if pages are missing
    if (missingPages.length > 0) {
      // Format missing pages nicely (e.g., "1, 3, 5-10, 45")
      const formattedMissing = this.formatPageRanges(missingPages);
      
      alerts.push({
        id: this.generateAlertId(),
        category: "missing_value",
        severity: missingPages.length > 5 ? "critical" : "high",
        title: "Missing Pages Detected",
        message: `Document declares ${expectedTotal} total pages but ${missingPages.length} page(s) are missing`,
        details: JSON.stringify({
          missingPages: formattedMissing,
          foundCount: foundPages.size,
          expectedCount: expectedTotal,
          missingCount: missingPages.length
        }),
        source: {
          pageNumber: 1,
          sectionType: "document",
          fieldLabel: "Page Completeness",
          boundingBox: { x: 0, y: 0, width: 0, height: 0 },
          surroundingContext: `Document pagination indicates ${expectedTotal} total pages`
        },
        relatedValues: [],
        suggestedAction: "Verify if pages are missing from the scanned document. Re-scan or obtain the complete document.",
        ruleId: "page_completeness_missing",
        formulaId: null,
        isResolved: false,
        resolvedBy: null,
        resolvedAt: null,
        resolution: null
      });
    }
    
    // Also check for duplicate page numbers (same declared page on multiple physical pages)
    const pageOccurrences = new Map<number, number[]>();
    for (const item of paginationData) {
      if (!pageOccurrences.has(item.declaredPage)) {
        pageOccurrences.set(item.declaredPage, []);
      }
      pageOccurrences.get(item.declaredPage)!.push(item.physicalIndex);
    }
    
    pageOccurrences.forEach((physicalPages, declaredPage) => {
      if (physicalPages.length > 1) {
        alerts.push({
          id: this.generateAlertId(),
          category: "consistency_error",
          severity: "medium",
          title: "Duplicate Page Number",
          message: `Page ${declaredPage} appears ${physicalPages.length} times in the document`,
          details: `Page ${declaredPage} was found on physical pages: ${physicalPages.join(", ")}. This may indicate a scanning error or duplicate pages.`,
          source: {
            pageNumber: physicalPages[0],
            sectionType: "header",
            fieldLabel: `Page ${declaredPage}`,
            boundingBox: { x: 0, y: 0, width: 0, height: 0 },
            surroundingContext: `Duplicate page number detected`
          },
          relatedValues: [],
          suggestedAction: "Review the duplicate pages to determine if they are identical copies or different pages with incorrect numbering.",
          ruleId: null,
          formulaId: null,
          isResolved: false,
          resolvedBy: null,
          resolvedAt: null,
          resolution: null
        });
      }
    });
    
    return alerts;
  }

  /**
   * Format an array of page numbers into readable ranges.
   * E.g., [1, 2, 3, 5, 7, 8, 9, 15] becomes "1-3, 5, 7-9, 15"
   */
  private formatPageRanges(pages: number[]): string {
    if (pages.length === 0) return "";
    
    const sorted = [...pages].sort((a, b) => a - b);
    const ranges: string[] = [];
    let rangeStart = sorted[0];
    let rangeEnd = sorted[0];
    
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === rangeEnd + 1) {
        // Extend current range
        rangeEnd = sorted[i];
      } else {
        // Close current range and start new one
        if (rangeStart === rangeEnd) {
          ranges.push(String(rangeStart));
        } else if (rangeEnd === rangeStart + 1) {
          // Just two consecutive numbers, list them
          ranges.push(String(rangeStart));
          ranges.push(String(rangeEnd));
        } else {
          ranges.push(`${rangeStart}-${rangeEnd}`);
        }
        rangeStart = sorted[i];
        rangeEnd = sorted[i];
      }
    }
    
    // Close the final range
    if (rangeStart === rangeEnd) {
      ranges.push(String(rangeStart));
    } else if (rangeEnd === rangeStart + 1) {
      ranges.push(String(rangeStart));
      ranges.push(String(rangeEnd));
    } else {
      ranges.push(`${rangeStart}-${rangeEnd}`);
    }
    
    return ranges.join(", ");
  }

  getSOPRules(): SOPRule[] {
    return [...this.sopRules];
  }

  updateSOPRule(ruleId: string, updates: Partial<SOPRule>): boolean {
    const index = this.sopRules.findIndex(r => r.id === ruleId);
    if (index === -1) return false;
    
    this.sopRules[index] = { ...this.sopRules[index], ...updates };
    return true;
  }

  addSOPRule(rule: SOPRule): void {
    this.sopRules.push(rule);
  }

  removeSOPRule(ruleId: string): boolean {
    const index = this.sopRules.findIndex(r => r.id === ruleId);
    if (index === -1) return false;
    
    this.sopRules.splice(index, 1);
    return true;
  }
}

export const validationEngine = new ValidationEngine();
