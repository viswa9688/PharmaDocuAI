import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import type { google } from "@google-cloud/documentai/build/protos/protos";

interface DocumentAIConfig {
  projectId: string;
  location: string;
  processorId: string;
  credentials: any;
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
      processOptions: {
        ocrConfig: {
          enableNativePdfParsing: true,
        },
      },
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
