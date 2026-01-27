import * as math from "mathjs";
import type {
  ExtractedValue,
  DetectedFormula,
  FormulaType,
} from "@shared/schema";

interface ParsedFormula {
  variableName: string;
  expression: string;
  normalizedExpression: string;
  variables: string[];
  headerText: string;
  columnIndex: number;
}

interface DocumentAITableCell {
  rowIndex: number;
  colIndex: number;
  text: string;
  confidence?: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
  isHeader?: boolean;
  rowSpan?: number;
  colSpan?: number;
}

interface DocumentAITable {
  rowCount: number;
  columnCount: number;
  cells: DocumentAITableCell[];
  confidence?: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

interface SimpleTableCell {
  text: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  confidence?: number;
}

interface SimpleTableRow {
  cells: SimpleTableCell[];
}

interface SimpleTable {
  rows: SimpleTableRow[];
  boundingBox?: { x: number; y: number; width: number; height: number };
  confidence?: number;
}

interface VariableMapping {
  name: string;
  normalizedName: string;
  value: number;
  columnIndex: number;
  source: ExtractedValue;
}

const VARIABLE_SYNONYMS: Record<string, string[]> = {
  "lod": ["lod", "lossondryin", "moisture", "dryloss", "lod%", "%lod"],
  "assay": ["assay", "content", "concentration", "purity", "assayondriedbasis", "driedbasis"],
  "zn": ["zn", "zinc", "znassay", "assayofzn", "contentofzn"],
  "potency": ["potency", "iu", "activity"],
};

export class DynamicFormulaDetector {
  private valueIdCounter = 0;
  private formulaIdCounter = 0;

  private generateValueId(): string {
    return `dynval_${++this.valueIdCounter}_${Date.now()}`;
  }

  private generateFormulaId(): string {
    return `dynformula_${++this.formulaIdCounter}_${Date.now()}`;
  }

  detectDynamicFormulas(
    tables: any[],
    extractedText: string,
    pageNumber: number,
    sectionType: string
  ): DetectedFormula[] {
    const formulas: DetectedFormula[] = [];

    console.log(`[DynamicFormulaDetector] Called for page ${pageNumber}, section: ${sectionType}`);
    console.log(`[DynamicFormulaDetector] Received ${tables.length} tables to analyze`);

    for (let i = 0; i < tables.length; i++) {
      const rawTable = tables[i];
      
      // Convert Document AI format to simple row-based format
      const table = this.normalizeTableFormat(rawTable);
      
      console.log(`[DynamicFormulaDetector] Table ${i}: ${table.rows?.length || 0} rows`);
      
      if (table.rows && table.rows.length > 0 && table.rows[0].cells) {
        const headerTexts = table.rows[0].cells.map(c => (c.text || "").substring(0, 50));
        console.log(`[DynamicFormulaDetector] Table ${i} headers:`, headerTexts);
      }
      
      const tableFormulas = this.processTable(table, pageNumber, sectionType);
      formulas.push(...tableFormulas);
    }

    console.log(`[DynamicFormulaDetector] Total formulas detected: ${formulas.length}`);
    return formulas;
  }

  private normalizeTableFormat(rawTable: any): SimpleTable {
    // If already in simple format (has rows property)
    if (rawTable.rows && Array.isArray(rawTable.rows)) {
      return rawTable as SimpleTable;
    }

    // Convert Document AI format (flat cells array) to nested rows format
    if (rawTable.cells && Array.isArray(rawTable.cells)) {
      const docTable = rawTable as DocumentAITable;
      const rowCount = docTable.rowCount || 0;
      const colCount = docTable.columnCount || 0;
      
      console.log(`[DynamicFormulaDetector] Converting Document AI table: ${rowCount} rows x ${colCount} cols, ${docTable.cells.length} cells`);
      
      // Create 2D array to hold cells
      const rowsArray: SimpleTableCell[][] = [];
      for (let r = 0; r < rowCount; r++) {
        rowsArray.push(new Array(colCount).fill(null).map(() => ({ text: "", confidence: 0 })));
      }
      
      // Populate cells from flat array
      for (const cell of docTable.cells) {
        const row = cell.rowIndex;
        const col = cell.colIndex;
        if (row >= 0 && row < rowCount && col >= 0 && col < colCount) {
          rowsArray[row][col] = {
            text: cell.text || "",
            boundingBox: cell.boundingBox,
            confidence: cell.confidence
          };
        }
      }
      
      return {
        rows: rowsArray.map(cells => ({ cells })),
        boundingBox: docTable.boundingBox,
        confidence: docTable.confidence
      };
    }

    console.log(`[DynamicFormulaDetector] Unknown table format:`, Object.keys(rawTable));
    return { rows: [] };
  }

  private processTable(table: SimpleTable, pageNumber: number, sectionType: string): DetectedFormula[] {
    const formulas: DetectedFormula[] = [];
    
    if (!table.rows || table.rows.length < 2) return formulas;

    const headerRow = table.rows[0];
    if (!headerRow.cells) return formulas;

    const parsedFormulas = this.extractFormulasFromHeaders(headerRow.cells);
    
    if (parsedFormulas.length === 0) return formulas;

    console.log(`[DynamicFormulaDetector] Found ${parsedFormulas.length} formulas in table headers`);

    const variableMappings = this.buildVariableMappings(table, pageNumber, sectionType);

    for (const parsedFormula of parsedFormulas) {
      console.log(`[DynamicFormulaDetector] Processing formula: ${parsedFormula.variableName} = ${parsedFormula.expression}`);
      console.log(`[DynamicFormulaDetector] Formula column index: ${parsedFormula.columnIndex}`);
      console.log(`[DynamicFormulaDetector] Variables needed: ${parsedFormula.variables.join(", ")}`);

      const actualResults = this.getColumnValues(table, parsedFormula.columnIndex, pageNumber, sectionType);
      console.log(`[DynamicFormulaDetector] Found ${actualResults.length} result values in column ${parsedFormula.columnIndex}`);

      for (let rowIdx = 0; rowIdx < actualResults.length; rowIdx++) {
        const actualResult = actualResults[rowIdx];
        const rowVariables = this.getRowVariables(variableMappings, rowIdx);
        
        console.log(`[DynamicFormulaDetector] Row ${rowIdx} variables:`, rowVariables.map(v => `${v.name}=${v.value}`));

        // Skip rows with unreasonable values that indicate header row misread
        // LOD should typically be 0-20%, if it's 100 it's likely from "(100-LOD)" in header
        const lodMapping = rowVariables.find(v => v.name === "LOD");
        if (lodMapping && (lodMapping.value === 100 || lodMapping.value > 50)) {
          console.log(`[DynamicFormulaDetector] Skipping row ${rowIdx}: LOD value ${lodMapping.value} appears to be from header text`);
          continue;
        }

        // Skip if no valid numeric values found
        if (rowVariables.length === 0) {
          console.log(`[DynamicFormulaDetector] Skipping row ${rowIdx}: no valid variable mappings`);
          continue;
        }

        const evaluationResult = this.evaluateFormula(
          parsedFormula,
          rowVariables
        );

        console.log(`[DynamicFormulaDetector] Evaluation result:`, evaluationResult);

        if (evaluationResult.success && actualResult.numericValue !== null) {
          const expectedResult = evaluationResult.result;
          const discrepancy = Math.abs(expectedResult - actualResult.numericValue);
          const tolerance = Math.max(0.01, Math.abs(expectedResult) * 0.005);
          const isWithinTolerance = discrepancy <= tolerance;

          console.log(`[DynamicFormulaDetector] Expected: ${expectedResult}, Actual: ${actualResult.numericValue}, Discrepancy: ${discrepancy}, Tolerance: ${tolerance}`);

          if (!isWithinTolerance) {
            console.log(`[DynamicFormulaDetector] DISCREPANCY DETECTED! Creating alert.`);
          }

          const operands = parsedFormula.variables
            .map(varName => {
              const mapping = rowVariables.find(m => 
                this.variablesMatch(m.normalizedName, varName)
              );
              if (mapping) {
                return {
                  name: varName,
                  value: mapping.source,
                  role: "operand" as const
                };
              }
              return null;
            })
            .filter((op): op is NonNullable<typeof op> => op !== null);

          formulas.push({
            id: this.generateFormulaId(),
            formulaType: this.classifyFormulaType(parsedFormula.expression),
            formulaExpression: parsedFormula.expression,
            operands,
            expectedResult: Math.round(expectedResult * 10000) / 10000,
            actualResult,
            discrepancy: Math.round(discrepancy * 10000) / 10000,
            tolerancePercent: 0.5,
            isWithinTolerance,
            source: actualResult.source
          });
        }
      }
    }

    return formulas;
  }

  private extractFormulasFromHeaders(cells: SimpleTableCell[]): ParsedFormula[] {
    const formulas: ParsedFormula[] = [];

    // Pattern 1: "Description (Variable) = formula" - captures variable letter from parentheses
    // Example: "Content of Zn on as is basis (Z) = (100-LOD)×Assay..."
    const descriptionFormulaPattern = /[^(]*\(([A-Z][0-9]?)\)\s*=\s*(.+)/i;
    
    // Pattern 2: Simple "Variable = formula"
    // Example: "Z1 = (100-LOD)×Assay..."
    const simplePattern = /^([A-Z][0-9]?)\s*=\s*(.+)/i;
    
    // Pattern 3: Any text with equals sign containing mathematical operators
    // Example: "Result = Value1 × Value2 / 100"
    const genericFormulaPattern = /=\s*(.+[×xX÷\/\*\+\-].+)/;

    console.log(`[DynamicFormulaDetector] Scanning ${cells.length} column headers for formulas`);

    for (let colIdx = 0; colIdx < cells.length; colIdx++) {
      const text = cells[colIdx].text || "";
      
      console.log(`[DynamicFormulaDetector] Header ${colIdx}: "${text.substring(0, 80)}..."`);
      
      let variableName: string | null = null;
      let expression: string | null = null;

      // Try pattern 1: Description (Variable) = formula
      let match = text.match(descriptionFormulaPattern);
      if (match) {
        variableName = match[1].trim();
        expression = match[2].trim();
        console.log(`[DynamicFormulaDetector] Matched description pattern: var=${variableName}`);
      }

      // Try pattern 2: Simple Variable = formula
      if (!variableName) {
        match = text.match(simplePattern);
        if (match) {
          variableName = match[1].trim();
          expression = match[2].trim();
          console.log(`[DynamicFormulaDetector] Matched simple pattern: var=${variableName}`);
        }
      }

      // Try pattern 3: Generic formula with operators
      if (!variableName && genericFormulaPattern.test(text)) {
        // Extract variable name from column label (before equals)
        const eqIndex = text.indexOf("=");
        if (eqIndex > 0) {
          const beforeEq = text.substring(0, eqIndex).trim();
          // Look for variable in parentheses at end
          const varMatch = beforeEq.match(/\(([A-Z][0-9]?)\)\s*$/i);
          if (varMatch) {
            variableName = varMatch[1];
          } else {
            // Use last word before equals as variable
            const words = beforeEq.split(/\s+/);
            variableName = words[words.length - 1].replace(/[^A-Za-z0-9]/g, "") || `Col${colIdx}`;
          }
          expression = text.substring(eqIndex + 1).trim();
          console.log(`[DynamicFormulaDetector] Matched generic pattern: var=${variableName}`);
        }
      }

      if (variableName && expression) {
        // Clean up expression
        expression = expression.replace(/\([^)]*decimals?\)/gi, "");
        expression = expression.replace(/\s+/g, " ").trim();

        const variables = this.extractVariables(expression);
        const normalizedExpression = this.normalizeExpression(expression, variables);

        formulas.push({
          variableName,
          expression,
          normalizedExpression,
          variables,
          headerText: text,
          columnIndex: colIdx
        });

        console.log(`[DynamicFormulaDetector] ✓ Parsed formula: ${variableName} = ${expression}`);
        console.log(`[DynamicFormulaDetector]   Normalized: ${normalizedExpression}`);
        console.log(`[DynamicFormulaDetector]   Variables: ${variables.join(", ")}`);
      }
    }

    console.log(`[DynamicFormulaDetector] Found ${formulas.length} formulas in headers`);
    return formulas;
  }

  private extractVariables(expression: string): string[] {
    const variables: string[] = [];
    
    if (/lod/i.test(expression)) variables.push("LOD");
    
    if (/assay\s*(of\s+)?zn|zn\s*%|content\s*of\s*zn/i.test(expression)) {
      variables.push("Zn_Assay");
    } else if (/assay\s*(on\s+)?dried\s*basis|dried\s*basis\s*%/i.test(expression)) {
      variables.push("Assay_Dried_Basis");
    } else if (/assay/i.test(expression) && !variables.some(v => v.includes("Assay"))) {
      variables.push("Assay");
    }
    
    if (/potency|iu\/g/i.test(expression)) variables.push("Potency");

    const numericConstantsPattern = /\b(\d+\.?\d*)\b/g;
    let match;
    while ((match = numericConstantsPattern.exec(expression)) !== null) {
      const num = match[1];
      if (!["100", "1000"].includes(num)) {
        variables.push(`CONST_${num}`);
      }
    }

    return Array.from(new Set(variables));
  }

  private normalizeExpression(expression: string, variables: string[]): string {
    let normalized = expression;
    
    // Step 1: Replace multiplication/division symbols FIRST (before removing spaces)
    normalized = normalized.replace(/[×xX]/g, "*");
    normalized = normalized.replace(/[÷]/g, "/");

    // Step 2: Replace variable phrases with canonical names BEFORE removing spaces
    // Order matters: more specific patterns first
    
    // Zn-related patterns
    normalized = normalized.replace(/Assay\s+of\s+Zn\s+on\s+dried\s+basis\s*%?/gi, "Zn_Assay");
    normalized = normalized.replace(/Assay\s+of\s+Zn\s*%?/gi, "Zn_Assay");
    normalized = normalized.replace(/Content\s+of\s+Zn\s+on\s+dried\s+basis\s*%?/gi, "Zn_Assay");
    normalized = normalized.replace(/Content\s+of\s+Zn\s*%?/gi, "Zn_Assay");
    normalized = normalized.replace(/Zn\s+Assay\s*%?/gi, "Zn_Assay");
    
    // Assay dried basis patterns
    normalized = normalized.replace(/Assay\s+on\s+dried\s+basis\s*%?/gi, "Assay_Dried_Basis");
    normalized = normalized.replace(/dried\s+basis\s*%?/gi, "Assay_Dried_Basis");
    
    // Generic assay
    normalized = normalized.replace(/%\s*Assay/gi, "Assay");
    
    // LOD patterns - normalize the (100-LOD) pattern
    normalized = normalized.replace(/\(\s*100\s*-\s*LOD\s*\)/gi, "(100-LOD)");
    normalized = normalized.replace(/100\s*-\s*LOD/gi, "(100-LOD)");

    // Step 3: Now remove extra spaces
    normalized = normalized.replace(/\s+/g, " ").trim();
    
    // Step 4: Add implicit multiplication between:
    // - closing paren and variable: )(100-LOD) Assay -> (100-LOD)*Assay
    // - closing paren and opening paren with no operator
    normalized = normalized.replace(/\)\s*([A-Za-z_])/g, ")*$1");
    normalized = normalized.replace(/\)\s*\(/g, ")*(");
    
    // Step 5: Remove remaining spaces (for mathjs)
    normalized = normalized.replace(/\s+/g, "");

    // Step 6: Handle truncated formulas - if formula has (100-LOD)*Variable but no /100, add it
    // This is common in pharmaceutical calculations where result is a percentage
    // Pattern handles both single and double parentheses: (100-LOD)*Var or ((100-LOD))*Var
    if (/\(*\(100-LOD\)\)*\*[A-Za-z_]+$/i.test(normalized) && !/\/100/.test(normalized)) {
      normalized = `(${normalized})/100`;
      console.log(`[DynamicFormulaDetector] Added /100 to truncated formula`);
    }

    console.log(`[DynamicFormulaDetector] Normalized expression: "${expression}" -> "${normalized}"`);
    return normalized;
  }

  private buildVariableMappings(
    table: SimpleTable, 
    pageNumber: number, 
    sectionType: string
  ): VariableMapping[][] {
    const mappings: VariableMapping[][] = [];
    
    if (!table.rows || table.rows.length < 2) return mappings;

    const headers = table.rows[0].cells.map((c: SimpleTableCell) => c.text || "");

    for (let rowIdx = 1; rowIdx < table.rows.length; rowIdx++) {
      const row = table.rows[rowIdx];
      if (!row.cells) continue;

      const rowMappings: VariableMapping[] = [];

      for (let colIdx = 0; colIdx < row.cells.length; colIdx++) {
        const cell = row.cells[colIdx];
        const cellText = cell.text || "";
        const header = headers[colIdx] || "";

        const numericMatch = cellText.match(/[-+]?\d*\.?\d+/);
        if (numericMatch) {
          const numericValue = parseFloat(numericMatch[0]);
          
          const variableNames = this.extractVariableNamesFromHeader(header);
          
          for (const varName of variableNames) {
            const extractedValue: ExtractedValue = {
              id: this.generateValueId(),
              rawValue: cellText,
              numericValue,
              unit: this.extractUnit(cellText),
              valueType: "numeric",
              source: {
                pageNumber,
                sectionType,
                fieldLabel: header,
                boundingBox: cell.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
                surroundingContext: `Row ${rowIdx}, ${header}`
              },
              confidence: cell.confidence || 0.8,
              isHandwritten: false
            };

            rowMappings.push({
              name: varName,
              normalizedName: this.normalizeVariableName(varName),
              value: numericValue,
              columnIndex: colIdx,
              source: extractedValue
            });
          }
        }
      }

      mappings.push(rowMappings);
    }

    return mappings;
  }

  private extractVariableNamesFromHeader(header: string): string[] {
    const names: string[] = [];
    const lowerHeader = header.toLowerCase();
    
    if (/lod\s*%?|loss\s*on\s*dry/i.test(header)) {
      names.push("LOD");
    }
    
    if (/assay\s*(of\s+)?zn|zn\s*%|zinc/i.test(header)) {
      names.push("Zn_Assay");
    }
    
    if (/assay\s*(on\s+)?dried\s*basis|dried\s*basis\s*%/i.test(header)) {
      names.push("Assay_Dried_Basis");
    }
    
    if (/assay/i.test(header) && !names.some(n => n.includes("Assay"))) {
      names.push("Assay");
    }
    
    if (/potency/i.test(header)) {
      names.push("Potency");
    }

    if (names.length === 0 && /^[A-Za-z][A-Za-z0-9_\s]*$/.test(header.trim())) {
      names.push(header.trim().replace(/\s+/g, "_"));
    }

    return names;
  }

  private normalizeVariableName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[%°]/g, "")
      .replace(/_+/g, "_")
      .trim();
  }

  private variablesMatch(name1: string, name2: string): boolean {
    const n1 = this.normalizeVariableName(name1);
    const n2 = this.normalizeVariableName(name2);
    
    if (n1 === n2) return true;
    if (n1.includes(n2) || n2.includes(n1)) return true;

    for (const [canonical, synonyms] of Object.entries(VARIABLE_SYNONYMS)) {
      const n1Matches = synonyms.some(s => n1.includes(s)) || n1.includes(canonical);
      const n2Matches = synonyms.some(s => n2.includes(s)) || n2.includes(canonical);
      if (n1Matches && n2Matches) return true;
    }

    return false;
  }

  private getColumnValues(
    table: SimpleTable,
    columnIndex: number,
    pageNumber: number,
    sectionType: string
  ): ExtractedValue[] {
    const values: ExtractedValue[] = [];

    if (columnIndex < 0 || !table.rows) return values;

    const header = table.rows[0]?.cells?.[columnIndex]?.text || `Column ${columnIndex}`;

    for (let rowIdx = 1; rowIdx < table.rows.length; rowIdx++) {
      const row = table.rows[rowIdx];
      if (!row.cells || columnIndex >= row.cells.length) continue;

      const cell = row.cells[columnIndex];
      const cellText = cell.text || "";

      const numericMatch = cellText.match(/[-+]?\d*\.?\d+/);
      if (numericMatch) {
        values.push({
          id: this.generateValueId(),
          rawValue: cellText,
          numericValue: parseFloat(numericMatch[0]),
          unit: this.extractUnit(cellText),
          valueType: "numeric",
          source: {
            pageNumber,
            sectionType,
            fieldLabel: header,
            boundingBox: cell.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
            surroundingContext: `Row ${rowIdx}, ${header}`
          },
          confidence: cell.confidence || 0.8,
          isHandwritten: false
        });
      }
    }

    return values;
  }

  private getRowVariables(mappings: VariableMapping[][], rowIndex: number): VariableMapping[] {
    if (rowIndex < mappings.length) {
      return mappings[rowIndex];
    }
    return [];
  }

  private evaluateFormula(
    parsedFormula: ParsedFormula,
    mappings: VariableMapping[]
  ): { success: boolean; result: number; error?: string } {
    try {
      const scope: Record<string, number> = {};

      // Build scope with all available variables from mappings
      for (const varName of parsedFormula.variables) {
        if (varName.startsWith("CONST_")) {
          scope[varName] = parseFloat(varName.replace("CONST_", ""));
          continue;
        }

        const mapping = mappings.find(m => this.variablesMatch(m.name, varName));

        if (mapping) {
          // Use the exact variable name as it appears in normalizedExpression
          scope[varName] = mapping.value;
          console.log(`[DynamicFormulaDetector] Mapped ${varName} = ${mapping.value}`);
        } else {
          console.log(`[DynamicFormulaDetector] WARNING: No mapping found for variable ${varName}`);
          return { success: false, result: 0, error: `Missing variable: ${varName}` };
        }
      }

      // The expression should already be normalized with proper variable names
      let evalExpression = parsedFormula.normalizedExpression;
      
      // Clean up any remaining invalid characters but keep valid math symbols
      evalExpression = evalExpression.replace(/[^a-zA-Z0-9_+\-*/().]/g, "");
      
      console.log(`[DynamicFormulaDetector] Evaluating: ${evalExpression}`);
      console.log(`[DynamicFormulaDetector] Scope:`, scope);
      
      const result = math.evaluate(evalExpression, scope);
      
      if (typeof result === "number" && !isNaN(result) && isFinite(result)) {
        console.log(`[DynamicFormulaDetector] Result: ${result}`);
        return { success: true, result };
      }
      
      return { success: false, result: 0, error: "Non-numeric result" };
    } catch (error) {
      console.error(`[DynamicFormulaDetector] Evaluation error:`, error);
      return { 
        success: false, 
        result: 0, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  }

  private classifyFormulaType(expression: string): FormulaType {
    if (/\(100\s*-\s*lod\)/i.test(expression) || /100\s*-\s*lod/i.test(expression)) {
      if (/zn|zinc/i.test(expression)) {
        return "assay_calculation";
      }
      return "lod_adjusted";
    }
    
    if (/iu\/g|potency/i.test(expression)) {
      return "potency_calculation";
    }

    if (/yield|recovery/i.test(expression)) {
      return "yield_percentage";
    }

    return "dynamic_formula";
  }

  private extractUnit(text: string): string | null {
    const unitPatterns = [
      /\b(IU\/g)\b/i,
      /\b(mg\/mL)\b/i,
      /%/,
      /°[CF]/i,
      /\b(psi|bar|kpa)\b/i,
      /\b(ml|l|mL|L)\b/i,
      /\b(kg|g|mg)\b/i,
    ];

    for (const pattern of unitPatterns) {
      const match = text.match(pattern);
      if (match) return match[0];
    }

    return null;
  }
}

export const dynamicFormulaDetector = new DynamicFormulaDetector();
