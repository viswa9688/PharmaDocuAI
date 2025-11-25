import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import type { google } from "@google-cloud/documentai/build/protos/protos";

interface DocumentAIConfig {
  projectId: string;
  location: string;
  processorId: string;
  credentials: any;
}

// Structured extraction data types
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
}

export interface TableCell {
  rowIndex: number;
  colIndex: number;
  text: string;
  confidence: number;
  boundingBox?: BoundingBox;
  isHeader?: boolean;
  rowSpan?: number;
  colSpan?: number;
}

export interface TableData {
  rowCount: number;
  columnCount: number;
  cells: TableCell[];
  confidence: number;
  boundingBox?: BoundingBox;
}

export interface FormField {
  fieldName: string;
  fieldValue: string;
  confidence: number;
  nameBoundingBox?: BoundingBox;
  valueBoundingBox?: BoundingBox;
}

export interface CheckboxData {
  state: "checked" | "unchecked" | "filled";
  confidence: number;
  boundingBox?: BoundingBox;
  associatedText?: string;
}

export interface HandwrittenRegion {
  text: string;
  confidence: number;
  boundingBox?: BoundingBox;
  isHandwritten: boolean;
}

export interface SignatureBlock {
  confidence: number;
  boundingBox?: BoundingBox;
  associatedLabel?: string;
}

export interface PageExtractionData {
  pageNumber: number;
  extractedText: string;
  tables: TableData[];
  formFields: FormField[];
  checkboxes: CheckboxData[];
  handwrittenRegions: HandwrittenRegion[];
  signatures: SignatureBlock[];
  textBlocks: Array<{
    text: string;
    boundingBox?: BoundingBox;
    confidence: number;
  }>;
  pageDimensions?: {
    width: number;
    height: number;
    unit: string;
  };
}

export class DocumentAIService {
  private client: DocumentProcessorServiceClient;
  private processorName: string;

  constructor(config: DocumentAIConfig) {
    // Initialize client with credentials
    this.client = new DocumentProcessorServiceClient({
      credentials: config.credentials,
      apiEndpoint: `${config.location}-documentai.googleapis.com`,
    });

    this.processorName = `projects/${config.projectId}/locations/${config.location}/processors/${config.processorId}`;
  }

  async processDocument(
    pdfBuffer: Buffer,
    mimeType: string = "application/pdf"
  ): Promise<google.cloud.documentai.v1.IDocument> {
    const encodedImage = pdfBuffer.toString("base64");

    const request = {
      name: this.processorName,
      rawDocument: {
        content: encodedImage,
        mimeType,
      },
      imagelessMode: true,
    };

    const [result] = await this.client.processDocument(request);
    
    if (!result.document) {
      throw new Error("No document returned from Document AI");
    }

    return result.document;
  }

  extractText(document: google.cloud.documentai.v1.IDocument): string {
    return document.text || "";
  }

  extractPageText(
    document: google.cloud.documentai.v1.IDocument,
    pageNumber: number
  ): string {
    if (!document.pages || !document.text) {
      return "";
    }

    const page = document.pages[pageNumber];
    if (!page || !page.layout || !page.layout.textAnchor) {
      return "";
    }

    const textSegments = page.layout.textAnchor.textSegments || [];
    let pageText = "";

    for (const segment of textSegments) {
      const startIndex = Number(segment.startIndex || 0);
      const endIndex = Number(segment.endIndex || 0);
      pageText += document.text.substring(startIndex, endIndex);
    }

    return pageText;
  }

  getTotalPages(document: google.cloud.documentai.v1.IDocument): number {
    return document.pages?.length || 0;
  }

  // Helper: Convert normalized vertices to bounding box
  private getBoundingBox(
    vertices: google.cloud.documentai.v1.INormalizedVertex[] | null | undefined,
    pageWidth: number,
    pageHeight: number
  ): BoundingBox | undefined {
    if (!vertices || vertices.length === 0) return undefined;

    const xs = vertices.map(v => (v.x || 0) * pageWidth);
    const ys = vertices.map(v => (v.y || 0) * pageHeight);

    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  // Helper: Extract text from text anchor
  private getTextFromAnchor(
    textAnchor: any | null | undefined,
    fullText: string
  ): string {
    if (!textAnchor || !textAnchor.textSegments) return "";

    let result = "";
    for (const segment of textAnchor.textSegments) {
      const startIndex = Number(segment.startIndex || 0);
      const endIndex = Number(segment.endIndex || 0);
      result += fullText.substring(startIndex, endIndex);
    }
    return result;
  }

  // Extract tables from a page
  extractTables(
    page: any,
    fullText: string,
    pageWidth: number,
    pageHeight: number
  ): TableData[] {
    if (!page.tables) return [];

    const tables: TableData[] = [];

    for (const table of page.tables) {
      const cells: TableCell[] = [];
      const occupancy: Map<string, boolean> = new Map(); // Track occupied cells (row,col)
      let maxRow = 0;
      let maxCol = 0;
      let currentRowIndex = 0;

      const markOccupied = (row: number, col: number, rowSpan: number, colSpan: number) => {
        for (let r = row; r < row + rowSpan; r++) {
          for (let c = col; c < col + colSpan; c++) {
            occupancy.set(`${r},${c}`, true);
          }
        }
      };

      const findNextFreeColumn = (row: number, startCol: number = 0): number => {
        let col = startCol;
        while (occupancy.has(`${row},${col}`)) {
          col++;
        }
        return col;
      };

      // Extract header rows
      if (table.headerRows) {
        for (const headerRow of table.headerRows) {
          if (headerRow.cells) {
            let lastColIndex = -1; // Track last column used in this row
            for (const cell of headerRow.cells) {
              const colIndex = findNextFreeColumn(currentRowIndex, lastColIndex + 1);
              const rowSpan = Number(cell.rowSpan || 1);
              const colSpan = Number(cell.colSpan || 1);
              
              cells.push({
                rowIndex: currentRowIndex,
                colIndex,
                text: this.getTextFromAnchor(cell.layout?.textAnchor, fullText).trim(),
                confidence: Number(cell.layout?.confidence || 0) * 100,
                boundingBox: this.getBoundingBox(
                  cell.layout?.boundingPoly?.normalizedVertices,
                  pageWidth,
                  pageHeight
                ),
                isHeader: true,
                rowSpan,
                colSpan,
              });

              markOccupied(currentRowIndex, colIndex, rowSpan, colSpan);
              maxRow = Math.max(maxRow, currentRowIndex + rowSpan - 1);
              maxCol = Math.max(maxCol, colIndex + colSpan - 1);
              lastColIndex = colIndex + colSpan - 1; // Update last column including span
            }
            currentRowIndex++;
          }
        }
      }

      // Extract body rows
      if (table.bodyRows) {
        for (const bodyRow of table.bodyRows) {
          if (bodyRow.cells) {
            let lastColIndex = -1; // Track last column used in this row
            for (const cell of bodyRow.cells) {
              const colIndex = findNextFreeColumn(currentRowIndex, lastColIndex + 1);
              const rowSpan = Number(cell.rowSpan || 1);
              const colSpan = Number(cell.colSpan || 1);
              
              cells.push({
                rowIndex: currentRowIndex,
                colIndex,
                text: this.getTextFromAnchor(cell.layout?.textAnchor, fullText).trim(),
                confidence: Number(cell.layout?.confidence || 0) * 100,
                boundingBox: this.getBoundingBox(
                  cell.layout?.boundingPoly?.normalizedVertices,
                  pageWidth,
                  pageHeight
                ),
                isHeader: false,
                rowSpan,
                colSpan,
              });

              markOccupied(currentRowIndex, colIndex, rowSpan, colSpan);
              maxRow = Math.max(maxRow, currentRowIndex + rowSpan - 1);
              maxCol = Math.max(maxCol, colIndex + colSpan - 1);
              lastColIndex = colIndex + colSpan - 1; // Update last column including span
            }
            currentRowIndex++;
          }
        }
      }

      tables.push({
        rowCount: maxRow + 1,
        columnCount: maxCol + 1,
        cells,
        confidence: Number(table.layout?.confidence || 0) * 100,
        boundingBox: this.getBoundingBox(
          table.layout?.boundingPoly?.normalizedVertices,
          pageWidth,
          pageHeight
        ),
      });
    }

    return tables;
  }

  // Extract form fields (key-value pairs)
  extractFormFields(
    page: any,
    fullText: string,
    pageWidth: number,
    pageHeight: number
  ): FormField[] {
    if (!page.formFields) return [];

    const formFields: FormField[] = [];

    for (const field of page.formFields) {
      const fieldName = this.getTextFromAnchor(field.fieldName?.textAnchor, fullText).trim();
      const fieldValue = this.getTextFromAnchor(field.fieldValue?.textAnchor, fullText).trim();

      formFields.push({
        fieldName,
        fieldValue,
        confidence: Number(field.fieldName?.confidence || 0) * 100,
        nameBoundingBox: this.getBoundingBox(
          field.fieldName?.boundingPoly?.normalizedVertices,
          pageWidth,
          pageHeight
        ),
        valueBoundingBox: this.getBoundingBox(
          field.fieldValue?.boundingPoly?.normalizedVertices,
          pageWidth,
          pageHeight
        ),
      });
    }

    return formFields;
  }

  // Extract checkboxes (detected as form fields with checkbox type)
  extractCheckboxes(
    page: any,
    fullText: string,
    pageWidth: number,
    pageHeight: number
  ): CheckboxData[] {
    if (!page.formFields) return [];

    const checkboxes: CheckboxData[] = [];

    for (const field of page.formFields) {
      const fieldValue = this.getTextFromAnchor(field.fieldValue?.textAnchor, fullText).trim().toLowerCase();
      
      // Detect checkboxes based on common patterns
      if (fieldValue === "x" || fieldValue === "✓" || fieldValue === "checked" || 
          fieldValue === "yes" || fieldValue === "☑" || fieldValue === "■") {
        checkboxes.push({
          state: "checked",
          confidence: Number(field.fieldValue?.confidence || 0) * 100,
          boundingBox: this.getBoundingBox(
            field.fieldValue?.boundingPoly?.normalizedVertices,
            pageWidth,
            pageHeight
          ),
          associatedText: this.getTextFromAnchor(field.fieldName?.textAnchor, fullText).trim(),
        });
      } else if (fieldValue === "" || fieldValue === "unchecked" || fieldValue === "no" || 
                 fieldValue === "☐" || fieldValue === "□") {
        checkboxes.push({
          state: "unchecked",
          confidence: Number(field.fieldValue?.confidence || 0) * 100,
          boundingBox: this.getBoundingBox(
            field.fieldValue?.boundingPoly?.normalizedVertices,
            pageWidth,
            pageHeight
          ),
          associatedText: this.getTextFromAnchor(field.fieldName?.textAnchor, fullText).trim(),
        });
      }
    }

    return checkboxes;
  }

  // Extract handwritten regions
  extractHandwrittenRegions(
    page: any,
    fullText: string,
    pageWidth: number,
    pageHeight: number
  ): HandwrittenRegion[] {
    if (!page.tokens) return [];

    const handwrittenRegions: HandwrittenRegion[] = [];

    for (const token of page.tokens) {
      // Check if token is detected as handwritten
      const isHandwritten = token.detectedLanguages?.some(
        (lang: any) => lang.languageCode?.includes("handwriting") || lang.languageCode === "und-Latn-x-handwritten"
      );

      if (isHandwritten || token.detectedBreak?.type === "WIDE_SPACE") {
        const text = this.getTextFromAnchor(token.layout?.textAnchor, fullText).trim();
        
        if (text) {
          handwrittenRegions.push({
            text,
            confidence: Number(token.layout?.confidence || 0) * 100,
            boundingBox: this.getBoundingBox(
              token.layout?.boundingPoly?.normalizedVertices,
              pageWidth,
              pageHeight
            ),
            isHandwritten: !!isHandwritten,
          });
        }
      }
    }

    return handwrittenRegions;
  }

  // Extract signature blocks (detected as image quality issues or specific symbols)
  extractSignatures(
    page: any,
    pageWidth: number,
    pageHeight: number
  ): SignatureBlock[] {
    // Note: Document AI doesn't have dedicated signature detection
    // This can be enhanced by looking for specific patterns or using custom models
    // For now, we return an empty array as placeholder for future enhancement
    return [];
  }

  // Comprehensive page extraction
  extractPageData(
    document: google.cloud.documentai.v1.IDocument,
    pageNumber: number
  ): PageExtractionData | null {
    if (!document.pages || !document.text) return null;

    const page = document.pages[pageNumber];
    if (!page) return null;

    // Get page dimensions
    const pageWidth = Number(page.dimension?.width || 0);
    const pageHeight = Number(page.dimension?.height || 0);
    const unit = page.dimension?.unit || "pixel";

    // Extract basic text
    const extractedText = this.extractPageText(document, pageNumber);

    // Extract all rich features
    const tables = this.extractTables(page, document.text, pageWidth, pageHeight);
    const formFields = this.extractFormFields(page, document.text, pageWidth, pageHeight);
    const checkboxes = this.extractCheckboxes(page, document.text, pageWidth, pageHeight);
    const handwrittenRegions = this.extractHandwrittenRegions(page, document.text, pageWidth, pageHeight);
    const signatures = this.extractSignatures(page, pageWidth, pageHeight);

    // Extract text blocks with positions
    const textBlocks: Array<{text: string; boundingBox?: BoundingBox; confidence: number}> = [];
    if (page.paragraphs) {
      for (const paragraph of page.paragraphs) {
        const text = this.getTextFromAnchor(paragraph.layout?.textAnchor, document.text).trim();
        if (text) {
          textBlocks.push({
            text,
            boundingBox: this.getBoundingBox(
              paragraph.layout?.boundingPoly?.normalizedVertices,
              pageWidth,
              pageHeight
            ),
            confidence: Number(paragraph.layout?.confidence || 0) * 100,
          });
        }
      }
    }

    return {
      pageNumber: pageNumber + 1, // Convert to 1-indexed
      extractedText,
      tables,
      formFields,
      checkboxes,
      handwrittenRegions,
      signatures,
      textBlocks,
      pageDimensions: {
        width: pageWidth,
        height: pageHeight,
        unit,
      },
    };
  }
}

export function createDocumentAIService(): DocumentAIService | null {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const location = process.env.GOOGLE_CLOUD_LOCATION || "us";
  const processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID;
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (!projectId || !processorId || !credentialsJson) {
    console.warn("Google Document AI credentials not configured");
    return null;
  }

  try {
    const credentials = JSON.parse(credentialsJson);

    return new DocumentAIService({
      projectId,
      location,
      processorId,
      credentials,
    });
  } catch (error) {
    console.error("Failed to initialize Document AI service:", error);
    return null;
  }
}
