import { PDFDocument } from "pdf-lib";

export interface PDFBatch {
  buffer: Buffer;
  startPage: number;
  endPage: number;
  pageCount: number;
}

export class PDFProcessorService {
  async splitPDF(pdfBuffer: Buffer): Promise<Buffer[]> {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();
    const pages: Buffer[] = [];

    for (let i = 0; i < pageCount; i++) {
      const singlePageDoc = await PDFDocument.create();
      const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [i]);
      singlePageDoc.addPage(copiedPage);
      
      const pdfBytes = await singlePageDoc.save();
      pages.push(Buffer.from(pdfBytes));
    }

    return pages;
  }

  async splitIntoBatches(pdfBuffer: Buffer, maxPagesPerBatch: number = 30): Promise<PDFBatch[]> {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const totalPages = pdfDoc.getPageCount();
    const batches: PDFBatch[] = [];

    for (let i = 0; i < totalPages; i += maxPagesPerBatch) {
      const startPage = i;
      const endPage = Math.min(i + maxPagesPerBatch, totalPages);
      const pageIndices = Array.from({ length: endPage - startPage }, (_, idx) => startPage + idx);

      const batchDoc = await PDFDocument.create();
      const copiedPages = await batchDoc.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach(page => batchDoc.addPage(page));

      const pdfBytes = await batchDoc.save();
      batches.push({
        buffer: Buffer.from(pdfBytes),
        startPage: startPage + 1,
        endPage: endPage,
        pageCount: endPage - startPage,
      });
    }

    return batches;
  }

  async getPageCount(pdfBuffer: Buffer): Promise<number> {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    return pdfDoc.getPageCount();
  }
}

export function createPDFProcessorService(): PDFProcessorService {
  return new PDFProcessorService();
}
