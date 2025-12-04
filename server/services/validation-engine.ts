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
      validationTimestamp: new Date()
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
      sop_violation: 0
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
    if (!field.fieldName || !field.fieldValue) return null;

    const numericMatch = field.fieldValue.match(/[-+]?\d*\.?\d+/);
    const numericValue = numericMatch ? parseFloat(numericMatch[0]) : null;
    const unit = this.extractUnit(field.fieldValue);
    const valueType = this.determineValueType(field.fieldValue);

    return {
      id: this.generateValueId(),
      rawValue: field.fieldValue,
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

    const batchNumbers = this.collectValuesByPattern(pageResults, /batch.*(?:no|#|number)/i);
    if (batchNumbers.size > 1) {
      const values = Array.from(batchNumbers.values()).flat();
      alerts.push({
        id: this.generateAlertId(),
        category: "consistency_error",
        severity: "high",
        title: "Inconsistent Batch Numbers",
        message: `Multiple batch numbers detected across document: ${Array.from(batchNumbers.keys()).join(", ")}`,
        details: `Found on pages: ${values.map(v => v.source.pageNumber).join(", ")}`,
        source: values[0]?.source || { pageNumber: 1, sectionType: "", fieldLabel: "Batch Number", boundingBox: { x: 0, y: 0, width: 0, height: 0 }, surroundingContext: "" },
        relatedValues: values,
        suggestedAction: "Verify correct batch number is recorded consistently throughout document",
        ruleId: null,
        formulaId: null,
        isResolved: false,
        resolvedBy: null,
        resolvedAt: null,
        resolution: null
      });
    }

    const lotNumbers = this.collectValuesByPattern(pageResults, /lot.*(?:no|#|number)/i);
    if (lotNumbers.size > 1) {
      const values = Array.from(lotNumbers.values()).flat();
      alerts.push({
        id: this.generateAlertId(),
        category: "consistency_error",
        severity: "high",
        title: "Inconsistent Lot Numbers",
        message: `Multiple lot numbers detected across document: ${Array.from(lotNumbers.keys()).join(", ")}`,
        details: `Found on pages: ${values.map(v => v.source.pageNumber).join(", ")}`,
        source: values[0]?.source || { pageNumber: 1, sectionType: "", fieldLabel: "Lot Number", boundingBox: { x: 0, y: 0, width: 0, height: 0 }, surroundingContext: "" },
        relatedValues: values,
        suggestedAction: "Verify correct lot number is recorded consistently throughout document",
        ruleId: null,
        formulaId: null,
        isResolved: false,
        resolvedBy: null,
        resolvedAt: null,
        resolution: null
      });
    }

    const timestamps = this.collectTimestamps(pageResults);
    const sequenceErrors = this.validateChronologicalOrder(timestamps);
    alerts.push(...sequenceErrors);

    return alerts;
  }

  private collectValuesByPattern(
    pageResults: PageValidationResult[],
    pattern: RegExp
  ): Map<string, ExtractedValue[]> {
    const valuesByContent = new Map<string, ExtractedValue[]>();

    for (const page of pageResults) {
      for (const value of page.extractedValues) {
        if (pattern.test(value.source.fieldLabel) && value.rawValue.trim()) {
          const key = value.rawValue.trim().toUpperCase();
          if (!valuesByContent.has(key)) {
            valuesByContent.set(key, []);
          }
          valuesByContent.get(key)!.push(value);
        }
      }
    }

    return valuesByContent;
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
