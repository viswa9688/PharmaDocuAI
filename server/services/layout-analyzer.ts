import type {
  TableData,
  FormField,
  CheckboxData,
  HandwrittenRegion,
  SignatureBlock,
  BoundingBox,
} from './document-ai';

// Text block type
export interface TextBlock {
  text: string;
  boundingBox?: BoundingBox;
  confidence: number;
}

// Section types found in pharmaceutical batch records
export type SectionType =
  | 'materials_log'
  | 'equipment_log'
  | 'cip_sip_record'
  | 'filtration_step'
  | 'filling_log'
  | 'inspection_sheet'
  | 'reconciliation_page'
  | 'attachment'
  | 'header'
  | 'footer'
  | 'unknown';

// Structured field value with metadata
export interface FieldValue {
  value: string | number | boolean;
  source: 'formField' | 'table' | 'checkbox' | 'handwritten' | 'text';
  confidence: number;
  boundingBox?: BoundingBox;
  rawText?: string;
}

// Recognized section with structured fields
export interface RecognizedSection {
  sectionType: SectionType;
  sectionTitle?: string;
  boundingBox: BoundingBox;
  confidence: number;
  fields: Record<string, FieldValue>;
  tables?: TableData[];
  checkboxes?: CheckboxData[];
  handwrittenNotes?: HandwrittenRegion[];
  signatures?: SignatureBlock[];
  textBlocks?: TextBlock[];
}

// Layout analysis result
export interface LayoutAnalysis {
  sections: RecognizedSection[];
  layoutStyle: 'single_column' | 'multi_column' | 'mixed' | 'table_based';
  pageStructure: {
    hasHeader: boolean;
    hasFooter: boolean;
    columnCount: number;
  };
}

// Extracted data input (from Document AI)
export interface ExtractedPageData {
  tables?: TableData[];
  formFields?: FormField[];
  checkboxes?: CheckboxData[];
  handwrittenRegions?: HandwrittenRegion[];
  signatures?: SignatureBlock[];
  textBlocks?: TextBlock[];
  pageDimensions?: { width: number; height: number };
}

export class LayoutAnalyzer {
  // Section detection patterns using text cues
  private sectionPatterns: Record<SectionType, RegExp[]> = {
    materials_log: [
      /materials?\s+(log|entry|record|list)/i,
      /raw\s+materials?/i,
      /components?\s+(used|added)/i,
      /bill\s+of\s+materials?/i,
    ],
    equipment_log: [
      /equipment\s+(log|record|list|used)/i,
      /machinery\s+used/i,
      /instruments?\s+used/i,
      /vessel\s+(id|number)/i,
    ],
    cip_sip_record: [
      /cip\s+(record|log|procedure)/i,
      /sip\s+(record|log|procedure)/i,
      /cleaning\s+in\s+place/i,
      /sterilization\s+in\s+place/i,
      /sanitization/i,
    ],
    filtration_step: [
      /filtration\s+(step|record|log)/i,
      /filter\s+(integrity|test)/i,
      /membrane\s+filter/i,
      /sterile\s+filter/i,
    ],
    filling_log: [
      /filling\s+(operation|record|log)/i,
      /vial\s+filling/i,
      /container\s+filling/i,
      /fill\s+volume/i,
    ],
    inspection_sheet: [
      /inspection\s+(sheet|record|log|report)/i,
      /in-?process\s+inspection/i,
      /visual\s+inspection/i,
      /quality\s+check/i,
    ],
    reconciliation_page: [
      /reconciliation/i,
      /material\s+balance/i,
      /yield\s+calculation/i,
      /discrepancy/i,
    ],
    attachment: [
      /attachment/i,
      /appendix/i,
      /supporting\s+document/i,
      /exhibit/i,
    ],
    header: [
      /batch\s+(number|id|record)/i,
      /product\s+name/i,
      /manufacturing\s+date/i,
      /document\s+(number|id)/i,
    ],
    footer: [
      /page\s+\d+\s+of\s+\d+/i,
      /signature/i,
      /reviewed\s+by/i,
      /approved\s+by/i,
    ],
    unknown: [],
  };

  // Common field patterns for batch records
  private fieldPatterns = {
    batchNumber: /batch\s*(number|no|#|id)[\s:]*([A-Z0-9-]+)/i,
    productName: /product\s*(name)?[\s:]*([\w\s]+)/i,
    lotNumber: /lot\s*(number|no|#)[\s:]*([A-Z0-9-]+)/i,
    date: /date[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    temperature: /temp(?:erature)?[\s:]*(\d+\.?\d*)\s*°?([CF])?/i,
    quantity: /qty|quantity[\s:]*(\d+\.?\d*)\s*(\w+)?/i,
    operator: /operator|performed\s+by[\s:]*([\w\s]+)/i,
  };

  analyze(extractedData: ExtractedPageData): LayoutAnalysis {
    const pageDims = extractedData.pageDimensions || { width: 1700, height: 2200 };
    
    // Detect sections from text blocks and form fields
    const detectedSections = this.detectSections(extractedData, pageDims);
    
    // Group extracted elements into sections based on spatial proximity
    const sectionsWithElements = this.assignElementsToSections(
      detectedSections,
      extractedData
    );
    
    // Map extracted values to structured fields
    const sectionsWithFields = this.extractFieldsFromSections(sectionsWithElements);
    
    // Determine layout style
    const layoutStyle = this.determineLayoutStyle(extractedData, pageDims);
    
    // Analyze page structure
    const pageStructure = this.analyzePageStructure(sectionsWithFields, pageDims);
    
    return {
      sections: sectionsWithFields,
      layoutStyle,
      pageStructure,
    };
  }

  private detectSections(
    data: ExtractedPageData,
    pageDims: { width: number; height: number }
  ): RecognizedSection[] {
    const sections: RecognizedSection[] = [];
    const allText = this.getAllText(data);
    
    // Combine text blocks and form fields for section detection
    const textElements = [
      ...(data.textBlocks || []),
      ...(data.formFields?.map(f => ({
        text: f.fieldName || '',
        boundingBox: f.nameBoundingBox,
        confidence: f.confidence,
      })) || []),
    ];

    // Sort by vertical position (top to bottom)
    textElements.sort((a, b) => 
      (a.boundingBox?.y || 0) - (b.boundingBox?.y || 0)
    );

    for (const element of textElements) {
      const text = element.text || '';
      
      // Check if this text matches any section pattern
      for (const [sectionType, patterns] of Object.entries(this.sectionPatterns)) {
        for (const pattern of patterns) {
          if (pattern.test(text)) {
            // Found a section header
            sections.push({
              sectionType: sectionType as SectionType,
              sectionTitle: text.trim(),
              boundingBox: element.boundingBox || {
                x: 0,
                y: 0,
                width: pageDims.width,
                height: 100,
              },
              confidence: element.confidence || 80,
              fields: {},
            });
            break;
          }
        }
      }
    }

    // If no sections detected, create a single unknown section
    if (sections.length === 0) {
      sections.push({
        sectionType: 'unknown',
        boundingBox: {
          x: 0,
          y: 0,
          width: pageDims.width,
          height: pageDims.height,
        },
        confidence: 50,
        fields: {},
      });
    }

    // Sort sections by vertical position
    sections.sort((a, b) => a.boundingBox.y - b.boundingBox.y);
    
    // Expand section bounding boxes to cover area until next section
    for (let i = 0; i < sections.length; i++) {
      const current = sections[i];
      const next = sections[i + 1];
      
      if (next) {
        current.boundingBox.height = next.boundingBox.y - current.boundingBox.y;
      } else {
        current.boundingBox.height = pageDims.height - current.boundingBox.y;
      }
    }

    return sections;
  }

  private assignElementsToSections(
    sections: RecognizedSection[],
    data: ExtractedPageData
  ): RecognizedSection[] {
    for (const section of sections) {
      // Assign tables
      section.tables = (data.tables || []).filter(table =>
        this.isElementInSection(table.boundingBox, section.boundingBox)
      );

      // Assign checkboxes
      section.checkboxes = (data.checkboxes || []).filter(cb =>
        this.isElementInSection(cb.boundingBox, section.boundingBox)
      );

      // Assign handwritten regions
      section.handwrittenNotes = (data.handwrittenRegions || []).filter(hw =>
        this.isElementInSection(hw.boundingBox, section.boundingBox)
      );

      // Assign signatures
      section.signatures = (data.signatures || []).filter(sig =>
        this.isElementInSection(sig.boundingBox, section.boundingBox)
      );

      // Assign text blocks
      section.textBlocks = (data.textBlocks || []).filter(tb =>
        this.isElementInSection(tb.boundingBox, section.boundingBox)
      );
    }

    return sections;
  }

  private extractFieldsFromSections(
    sections: RecognizedSection[]
  ): RecognizedSection[] {
    for (const section of sections) {
      // Extract fields from form fields (already key-value pairs)
      const formFields = this.getFormFieldsInSection(section);
      for (const [key, value] of Object.entries(formFields)) {
        section.fields[key] = value;
      }

      // Extract fields from tables
      const tableFields = this.extractFieldsFromTables(section.tables || []);
      for (const [key, value] of Object.entries(tableFields)) {
        section.fields[key] = value;
      }

      // Extract fields from checkboxes
      const checkboxFields = this.extractFieldsFromCheckboxes(section.checkboxes || []);
      for (const [key, value] of Object.entries(checkboxFields)) {
        section.fields[key] = value;
      }

      // Extract fields from text blocks using pattern matching
      const textFields = this.extractFieldsFromText(section.textBlocks || []);
      for (const [key, value] of Object.entries(textFields)) {
        // Only add if not already extracted from more reliable sources
        if (!section.fields[key]) {
          section.fields[key] = value;
        }
      }
    }

    return sections;
  }

  private getFormFieldsInSection(section: RecognizedSection): Record<string, FieldValue> {
    const fields: Record<string, FieldValue> = {};
    
    // Form fields from the extraction are already in the section via spatial assignment
    // We need to access them from textBlocks or add a separate formFields property
    // For now, we'll extract from section's assigned data
    
    return fields;
  }

  private extractFieldsFromTables(tables: TableData[]): Record<string, FieldValue> {
    const fields: Record<string, FieldValue> = {};
    
    for (const table of tables) {
      // Extract key-value pairs from 2-column tables
      if (table.columnCount === 2) {
        const rows: any[] = [];
        for (let r = 0; r < table.rowCount; r++) {
          rows[r] = [];
        }
        
        for (const cell of table.cells) {
          if (!rows[cell.rowIndex]) rows[cell.rowIndex] = [];
          rows[cell.rowIndex][cell.colIndex] = cell;
        }

        for (const row of rows) {
          if (row.length === 2 && row[0] && row[1]) {
            const key = this.normalizeFieldName(row[0].text);
            const value = row[1].text;
            
            fields[key] = {
              value,
              source: 'table',
              confidence: Math.min(row[0].confidence, row[1].confidence),
              boundingBox: row[1].boundingBox,
              rawText: value,
            };
          }
        }
      }
    }
    
    return fields;
  }

  private extractFieldsFromCheckboxes(checkboxes: CheckboxData[]): Record<string, FieldValue> {
    const fields: Record<string, FieldValue> = {};
    
    for (const checkbox of checkboxes) {
      const key = this.normalizeFieldName(checkbox.associatedText || 'checkbox');
      fields[key] = {
        value: checkbox.state === 'checked',
        source: 'checkbox',
        confidence: checkbox.confidence,
        boundingBox: checkbox.boundingBox,
        rawText: checkbox.associatedText,
      };
    }
    
    return fields;
  }

  private extractFieldsFromText(textBlocks: TextBlock[]): Record<string, FieldValue> {
    const fields: Record<string, FieldValue> = {};
    
    for (const block of textBlocks) {
      const text = block.text || '';
      
      // Try to match common field patterns
      for (const [fieldName, pattern] of Object.entries(this.fieldPatterns)) {
        const match = pattern.exec(text);
        if (match && match[1]) {
          const key = this.normalizeFieldName(fieldName);
          fields[key] = {
            value: match[1].trim(),
            source: 'text',
            confidence: block.confidence || 70,
            boundingBox: block.boundingBox,
            rawText: text,
          };
        }
      }
    }
    
    return fields;
  }

  private normalizeFieldName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private isElementInSection(
    elementBox: BoundingBox | undefined,
    sectionBox: BoundingBox
  ): boolean {
    if (!elementBox) return false;
    
    // Check if element's vertical center is within section bounds
    const elementCenterY = elementBox.y + elementBox.height / 2;
    return (
      elementCenterY >= sectionBox.y &&
      elementCenterY <= sectionBox.y + sectionBox.height
    );
  }

  private determineLayoutStyle(
    data: ExtractedPageData,
    pageDims: { width: number; height: number }
  ): 'single_column' | 'multi_column' | 'mixed' | 'table_based' {
    const tables = data.tables || [];
    const textBlocks = data.textBlocks || [];
    
    // If mostly tables, it's table-based
    if (tables.length > textBlocks.length) {
      return 'table_based';
    }
    
    // Check if text blocks are arranged in columns
    const leftColumnBlocks = textBlocks.filter(
      tb => (tb.boundingBox?.x || 0) < pageDims.width / 2
    );
    const rightColumnBlocks = textBlocks.filter(
      tb => (tb.boundingBox?.x || 0) >= pageDims.width / 2
    );
    
    if (leftColumnBlocks.length > 0 && rightColumnBlocks.length > 0) {
      return 'multi_column';
    }
    
    return 'single_column';
  }

  private analyzePageStructure(
    sections: RecognizedSection[],
    pageDims: { width: number; height: number }
  ): { hasHeader: boolean; hasFooter: boolean; columnCount: number } {
    const hasHeader = sections.some(s => s.sectionType === 'header');
    const hasFooter = sections.some(s => s.sectionType === 'footer');
    
    // Determine column count based on section widths
    let columnCount = 1;
    const narrowSections = sections.filter(
      s => s.boundingBox.width < pageDims.width * 0.6
    );
    if (narrowSections.length >= sections.length * 0.5) {
      columnCount = 2;
    }
    
    return { hasHeader, hasFooter, columnCount };
  }

  private getAllText(data: ExtractedPageData): string {
    const parts: string[] = [];
    
    if (data.textBlocks) {
      parts.push(...data.textBlocks.map(tb => tb.text || ''));
    }
    
    if (data.formFields) {
      parts.push(...data.formFields.map(ff => `${ff.fieldName}: ${ff.fieldValue}`));
    }
    
    return parts.join('\n');
  }
}
