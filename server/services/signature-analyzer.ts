import type {
  HandwrittenRegion,
  SignatureBlock,
  CheckboxData,
  FormField,
  BoundingBox,
  TableData,
  TableCell,
} from './document-ai';
import type { TextBlock } from './layout-analyzer';

// Simple signature field result
export interface SignatureField {
  fieldLabel: string;
  isSigned: boolean;
  dateText?: string;
  rowIndex?: number;
  boundingBox?: BoundingBox;
  confidence: number;
}

// Legacy types for backward compatibility
export type SignatureRole =
  | 'operator'
  | 'supervisor'
  | 'reviewer'
  | 'qa_reviewer'
  | 'qa_approver'
  | 'verifier'
  | 'manager'
  | 'released_by'
  | 'checked_by'
  | 'performed_by'
  | 'unknown';

export interface DetectedSignature {
  role: SignatureRole;
  fieldLabel: string;
  boundingBox: BoundingBox;
  associatedDate?: string;
  dateBoundingBox?: BoundingBox;
  confidence: number;
  signatureType: 'handwritten' | 'stamp' | 'initial';
  hasDate: boolean;
}

export interface ApprovalCheckpoint {
  role: SignatureRole;
  signature?: DetectedSignature;
  checkbox?: CheckboxData;
  isComplete: boolean;
  isMissing: boolean;
  associatedText?: string;
}

// Simplified approval analysis result
export interface ApprovalAnalysis {
  signatures: DetectedSignature[];
  checkpoints: ApprovalCheckpoint[];
  approvalChain: SignatureRole[];
  missingSignatures: SignatureRole[];
  sequenceValid: boolean;
  allDatesPresent: boolean;
  allCheckboxesChecked: boolean;
  finalApprovalRole?: SignatureRole;
  // New simplified output
  signatureFields: SignatureField[];
}

// Input data from Document AI
export interface ExtractedApprovalData {
  handwrittenRegions?: HandwrittenRegion[];
  signatures?: SignatureBlock[];
  checkboxes?: CheckboxData[];
  formFields?: FormField[];
  textBlocks?: TextBlock[];
  tables?: TableData[];
  pageDimensions?: { width: number; height: number };
}

export class SignatureAnalyzer {
  // Patterns to identify signature columns/fields
  private signatureFieldPatterns = [
    /recorded\s*b?y?/i,
    /verified\s*b?y?/i,
    /sign(?:ed|ature)?/i,
    /initial/i,
    /done\s*by/i,
    /checked\s*by/i,
    /s\/?d/i, // S/D = Sign & Date
    /pd\s*s\/?d/i, // PD S/D
    /ipqa\s*s\/?d/i, // IPQA S/D
    /ipqa/i,
  ];

  // Date patterns
  private datePatterns = [
    /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/, // MM/DD/YYYY or DD-MM-YYYY
    /\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4}/i, // DD MMM YYYY
    /\d{4}[-/]\d{1,2}[-/]\d{1,2}/, // YYYY-MM-DD
    /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}/i, // Month DD, YYYY
  ];

  /**
   * Check if the page contains any signature-related fields.
   */
  private pageRequiresSignatureCheck(data: ExtractedApprovalData): boolean {
    const allText: string[] = [];

    if (data.textBlocks) {
      for (const block of data.textBlocks) {
        if (block.text) allText.push(block.text);
      }
    }

    if (data.formFields) {
      for (const field of data.formFields) {
        if (field.fieldName) allText.push(field.fieldName);
        if (field.fieldValue) allText.push(field.fieldValue);
      }
    }

    if (data.tables) {
      for (const table of data.tables) {
        for (const cell of table.cells) {
          if (cell.isHeader && cell.text) allText.push(cell.text);
        }
      }
    }

    const pageText = allText.join(' ');

    for (const pattern of this.signatureFieldPatterns) {
      if (pattern.test(pageText)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Main analysis method - now uses simplified signature field detection.
   */
  analyze(data: ExtractedApprovalData): ApprovalAnalysis {
    // First check if this page contains signature-related fields
    if (!this.pageRequiresSignatureCheck(data)) {
      return this.emptyApprovalAnalysis();
    }

    // Use simplified signature field detection
    const signatureFields = this.detectSignatureFields(data);

    // Convert to legacy format for backward compatibility
    const signatures: DetectedSignature[] = signatureFields
      .filter(f => f.isSigned)
      .map(f => ({
        role: 'unknown' as SignatureRole,
        fieldLabel: f.fieldLabel,
        boundingBox: f.boundingBox || { x: 0, y: 0, width: 50, height: 20 },
        associatedDate: f.dateText,
        confidence: f.confidence,
        signatureType: 'handwritten' as const,
        hasDate: !!f.dateText,
      }));

    // Build checkpoints from signature fields (one per field, not per role)
    const checkpoints: ApprovalCheckpoint[] = signatureFields.map(f => ({
      role: 'unknown' as SignatureRole,
      signature: f.isSigned ? {
        role: 'unknown' as SignatureRole,
        fieldLabel: f.fieldLabel,
        boundingBox: f.boundingBox || { x: 0, y: 0, width: 50, height: 20 },
        associatedDate: f.dateText,
        confidence: f.confidence,
        signatureType: 'handwritten' as const,
        hasDate: !!f.dateText,
      } : undefined,
      checkbox: undefined,
      isComplete: f.isSigned,
      isMissing: !f.isSigned,
      associatedText: f.fieldLabel,
    }));

    const missingSignatures: SignatureRole[] = signatureFields
      .filter(f => !f.isSigned)
      .map(() => 'unknown' as SignatureRole);

    const allDatesPresent = signatureFields
      .filter(f => f.isSigned)
      .every(f => !!f.dateText);

    return {
      signatures,
      checkpoints,
      approvalChain: [],
      missingSignatures,
      sequenceValid: true, // No sequence validation
      allDatesPresent,
      allCheckboxesChecked: true,
      finalApprovalRole: undefined,
      signatureFields,
    };
  }

  /**
   * Simplified signature field detection.
   * Finds signature columns in tables and checks if cells have content.
   */
  private detectSignatureFields(data: ExtractedApprovalData): SignatureField[] {
    const fields: SignatureField[] = [];

    // Detect from tables (primary method)
    if (data.tables) {
      for (const table of data.tables) {
        const tableFields = this.detectTableSignatureFields(table);
        fields.push(...tableFields);
      }
    }

    // Detect from standalone form fields (Done By, Checked By, Verified By)
    const standaloneFields = this.detectStandaloneSignatureFields(data);
    fields.push(...standaloneFields);

    console.log(`[SignatureAnalyzer] Detected ${fields.length} signature fields`);
    for (const field of fields) {
      console.log(`[SignatureAnalyzer]   - "${field.fieldLabel}": ${field.isSigned ? 'SIGNED' : 'MISSING'}${field.dateText ? ` (date: ${field.dateText})` : ''}`);
    }

    return fields;
  }

  /**
   * Detect signature fields from table columns.
   */
  private detectTableSignatureFields(table: TableData): SignatureField[] {
    const fields: SignatureField[] = [];

    // Find columns that are signature columns
    const signatureColumns = this.findSignatureColumns(table);

    if (signatureColumns.length === 0) return fields;

    // For each signature column, check all non-header cells
    for (const sigCol of signatureColumns) {
      const columnCells = table.cells.filter(
        cell => cell.colIndex === sigCol.columnIndex && !cell.isHeader
      );

      for (const cell of columnCells) {
        const cellText = (cell.text || '').trim();
        const hasContent = cellText.length > 0;

        // Look for date in same row
        const dateText = this.findDateInRow(table, cell.rowIndex, sigCol.columnIndex);

        fields.push({
          fieldLabel: sigCol.headerText,
          isSigned: hasContent,
          dateText: dateText || undefined,
          rowIndex: cell.rowIndex,
          boundingBox: cell.boundingBox,
          confidence: cell.confidence || 80,
        });
      }
    }

    return fields;
  }

  /**
   * Find signature columns by checking header cells.
   */
  private findSignatureColumns(table: TableData): Array<{ columnIndex: number; headerText: string }> {
    const signatureColumns: Array<{ columnIndex: number; headerText: string }> = [];

    const headerCells = table.cells.filter(cell => cell.isHeader);

    for (const headerCell of headerCells) {
      const headerText = (headerCell.text || '').trim();

      for (const pattern of this.signatureFieldPatterns) {
        if (pattern.test(headerText)) {
          signatureColumns.push({
            columnIndex: headerCell.colIndex,
            headerText,
          });
          break;
        }
      }
    }

    return signatureColumns;
  }

  /**
   * Find date text in the same row.
   */
  private findDateInRow(table: TableData, rowIndex: number, signatureColIndex: number): string | null {
    const rowCells = table.cells.filter(
      cell => cell.rowIndex === rowIndex && cell.colIndex !== signatureColIndex
    );

    for (const cell of rowCells) {
      const cellText = (cell.text || '').trim();

      for (const datePattern of this.datePatterns) {
        const match = cellText.match(datePattern);
        if (match) {
          return match[0];
        }
      }
    }

    return null;
  }

  /**
   * Detect standalone signature fields (not in tables).
   * Looks for patterns like "Done By PD S/D: ____" in text blocks.
   */
  private detectStandaloneSignatureFields(data: ExtractedApprovalData): SignatureField[] {
    const fields: SignatureField[] = [];
    const processedLabels = new Set<string>();

    // Patterns for standalone signature fields
    const standalonePatterns = [
      /done\s+by\s+pd\s*s\/?d/i,
      /checked\s+by\s+pd\s*s\/?d/i,
      /verified\s+by\s+ipqa\s*s\/?d/i,
      /done\s+by/i,
      /checked\s+by/i,
      /verified\s+by/i,
    ];

    // Get all text elements
    const textElements: Array<{ text: string; boundingBox?: BoundingBox }> = [];

    if (data.textBlocks) {
      for (const block of data.textBlocks) {
        if (block.text) {
          textElements.push({ text: block.text, boundingBox: block.boundingBox });
        }
      }
    }

    if (data.formFields) {
      for (const field of data.formFields) {
        if (field.fieldName) {
          textElements.push({ text: field.fieldName, boundingBox: field.nameBoundingBox });
        }
      }
    }

    // Check for labels that match signature field patterns
    for (const element of textElements) {
      for (const pattern of standalonePatterns) {
        if (pattern.test(element.text)) {
          const labelKey = element.text.trim().toLowerCase();
          if (processedLabels.has(labelKey)) continue;
          processedLabels.add(labelKey);

          // Check if there's handwritten content or date nearby
          const hasNearbyContent = this.hasNearbySignatureContent(
            element.boundingBox,
            data.handwrittenRegions,
            data.signatures,
            textElements
          );

          // Check for date in text
          let dateText: string | undefined;
          for (const datePattern of this.datePatterns) {
            const match = element.text.match(datePattern);
            if (match) {
              dateText = match[0];
              break;
            }
          }

          // For standalone fields, assume signed if there's ANY nearby handwriting or date
          const isSigned = hasNearbyContent || !!dateText;

          fields.push({
            fieldLabel: element.text.trim(),
            isSigned,
            dateText,
            boundingBox: element.boundingBox,
            confidence: 80,
          });
          break;
        }
      }
    }

    return fields;
  }

  /**
   * Check if there's handwritten content or date near a signature label.
   */
  private hasNearbySignatureContent(
    labelBox: BoundingBox | undefined,
    handwrittenRegions: HandwrittenRegion[] | undefined,
    signatures: SignatureBlock[] | undefined,
    textElements: Array<{ text: string; boundingBox?: BoundingBox }>
  ): boolean {
    if (!labelBox) return false;

    // Check handwritten regions
    if (handwrittenRegions) {
      for (const region of handwrittenRegions) {
        if (region.boundingBox && this.isNearby(labelBox, region.boundingBox, 200)) {
          return true;
        }
      }
    }

    // Check signature blocks
    if (signatures) {
      for (const sig of signatures) {
        if (sig.boundingBox && this.isNearby(labelBox, sig.boundingBox, 200)) {
          return true;
        }
      }
    }

    // Check for dates in nearby text
    for (const element of textElements) {
      if (!element.boundingBox || !this.isNearby(labelBox, element.boundingBox, 300)) continue;

      for (const datePattern of this.datePatterns) {
        if (datePattern.test(element.text)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if two bounding boxes are within a certain distance.
   */
  private isNearby(box1: BoundingBox, box2: BoundingBox, maxDistance: number): boolean {
    const center1 = { x: box1.x + box1.width / 2, y: box1.y + box1.height / 2 };
    const center2 = { x: box2.x + box2.width / 2, y: box2.y + box2.height / 2 };

    const distance = Math.sqrt(
      Math.pow(center1.x - center2.x, 2) + Math.pow(center1.y - center2.y, 2)
    );

    return distance <= maxDistance;
  }

  /**
   * Returns an empty approval analysis structure.
   */
  private emptyApprovalAnalysis(): ApprovalAnalysis {
    return {
      signatures: [],
      checkpoints: [],
      approvalChain: [],
      missingSignatures: [],
      sequenceValid: true,
      allDatesPresent: true,
      allCheckboxesChecked: true,
      finalApprovalRole: undefined,
      signatureFields: [],
    };
  }
}
