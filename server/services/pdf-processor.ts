import { PDFDocument } from "pdf-lib";

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

  async getPageCount(pdfBuffer: Buffer): Promise<number> {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    return pdfDoc.getPageCount();
  }
}

export function createPDFProcessorService(): PDFProcessorService {
  return new PDFProcessorService();
}
