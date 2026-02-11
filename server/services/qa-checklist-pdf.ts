import PDFDocument from "pdfkit";
import type { QAChecklist, QACheckItem, ValidationAlert } from "@shared/schema";

export interface AlertReviewWithUser {
  id: number;
  alertId: string;
  documentId: string;
  reviewerId: string;
  decision: string;
  comment: string;
  createdAt: string;
  reviewer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
}

const COLORS = {
  pass: "#16a34a",
  fail: "#dc2626",
  na: "#6b7280",
  headerBg: "#1e293b",
  headerText: "#ffffff",
  tableBorder: "#d1d5db",
  altRowBg: "#f9fafb",
  white: "#ffffff",
  black: "#111827",
  mutedText: "#6b7280",
  approvedBg: "#f0fdf4",
  approvedBorder: "#bbf7d0",
  alertBg: "#fef2f2",
  alertBorder: "#fecaca",
};

const MARGIN = 50;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const COL1_WIDTH = 200;
const COL2_WIDTH = 80;
const COL3_WIDTH = CONTENT_WIDTH - COL1_WIDTH - COL2_WIDTH;

export async function generateQAChecklistPDF(
  checklist: QAChecklist,
  reviews: AlertReviewWithUser[],
  documentFilename: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const reviewsByAlertId = new Map<string, AlertReviewWithUser>();
    const sorted = [...reviews].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    for (const review of sorted) {
      if (!reviewsByAlertId.has(review.alertId)) {
        reviewsByAlertId.set(review.alertId, review);
      }
    }

    let adjustedPassed = checklist.passedChecks;
    let adjustedFailed = checklist.failedChecks;
    for (const item of checklist.items) {
      if (item.status === "fail" && item.relatedAlerts && item.relatedAlerts.length > 0) {
        const allApproved = item.relatedAlerts.every((alert) => {
          const review = reviewsByAlertId.get(alert.id);
          return review?.decision === "approved";
        });
        if (allApproved) {
          adjustedPassed++;
          adjustedFailed--;
        }
      }
    }

    const passRate =
      checklist.totalChecks > 0
        ? Math.round((adjustedPassed / checklist.totalChecks) * 100)
        : 0;
    const overallStatus = adjustedFailed === 0 ? "Compliant" : "Review Required";
    const generationDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    drawHeader(doc, documentFilename, generationDate);
    drawSummary(doc, adjustedPassed, adjustedFailed, checklist.naChecks, overallStatus, passRate);
    drawTable(doc, checklist, reviewsByAlertId);
    addFooters(doc);

    doc.end();
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > doc.page.height - MARGIN - 30) {
    doc.addPage();
    doc.y = MARGIN;
  }
}

function drawHeader(doc: PDFKit.PDFDocument, filename: string, date: string): void {
  doc
    .fontSize(20)
    .fillColor(COLORS.headerBg)
    .text("QA Review Checklist Report", MARGIN, MARGIN, { align: "center", width: CONTENT_WIDTH });

  doc.moveDown(0.5);

  doc
    .fontSize(11)
    .fillColor(COLORS.mutedText)
    .text(`Document: ${filename}`, MARGIN, doc.y, { align: "center", width: CONTENT_WIDTH });

  doc
    .fontSize(9)
    .text(`Generated: ${date}`, MARGIN, doc.y + 2, { align: "center", width: CONTENT_WIDTH });

  doc.moveDown(1);

  doc
    .strokeColor(COLORS.tableBorder)
    .lineWidth(1)
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + CONTENT_WIDTH, doc.y)
    .stroke();

  doc.moveDown(0.5);
}

function drawSummary(
  doc: PDFKit.PDFDocument,
  passed: number,
  failed: number,
  na: number,
  status: string,
  passRate: number
): void {
  doc
    .fontSize(14)
    .fillColor(COLORS.black)
    .text("Summary", MARGIN, doc.y);
  doc.moveDown(0.5);

  const boxWidth = (CONTENT_WIDTH - 20) / 3;
  const boxHeight = 50;
  const startX = MARGIN;
  const startY = doc.y;

  drawStatBox(doc, startX, startY, boxWidth, boxHeight, "Passed", String(passed), COLORS.pass);
  drawStatBox(doc, startX + boxWidth + 10, startY, boxWidth, boxHeight, "Failed", String(failed), COLORS.fail);
  drawStatBox(doc, startX + (boxWidth + 10) * 2, startY, boxWidth, boxHeight, "N/A", String(na), COLORS.na);

  doc.y = startY + boxHeight + 10;

  const statusColor = status === "Compliant" ? COLORS.pass : COLORS.fail;
  doc
    .fontSize(10)
    .fillColor(COLORS.mutedText)
    .text("Overall Status: ", MARGIN, doc.y, { continued: true })
    .fillColor(statusColor)
    .font("Helvetica-Bold")
    .text(status, { continued: true })
    .font("Helvetica")
    .fillColor(COLORS.mutedText)
    .text(`    |    Pass Rate: ${passRate}%`);

  doc.moveDown(1);
}

function drawStatBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  color: string
): void {
  doc
    .save()
    .roundedRect(x, y, w, h, 4)
    .lineWidth(1)
    .strokeColor(color)
    .fillAndStroke("#ffffff", color)
    .restore();

  doc
    .fontSize(18)
    .fillColor(color)
    .text(value, x, y + 8, { width: w, align: "center" });

  doc
    .fontSize(8)
    .fillColor(COLORS.mutedText)
    .text(label, x, y + 32, { width: w, align: "center" });
}

function drawTableHeader(doc: PDFKit.PDFDocument): void {
  const y = doc.y;
  const rowHeight = 25;

  doc
    .save()
    .rect(MARGIN, y, CONTENT_WIDTH, rowHeight)
    .fill(COLORS.headerBg);

  doc
    .fontSize(9)
    .fillColor(COLORS.headerText)
    .font("Helvetica-Bold")
    .text("Checkpoints", MARGIN + 5, y + 7, { width: COL1_WIDTH - 10 })
    .text("Inference", MARGIN + COL1_WIDTH + 5, y + 7, { width: COL2_WIDTH - 10, align: "center" })
    .text("Remarks", MARGIN + COL1_WIDTH + COL2_WIDTH + 5, y + 7, { width: COL3_WIDTH - 10 });

  doc.font("Helvetica").restore();

  doc
    .strokeColor(COLORS.tableBorder)
    .lineWidth(0.5)
    .moveTo(MARGIN + COL1_WIDTH, y)
    .lineTo(MARGIN + COL1_WIDTH, y + rowHeight)
    .stroke()
    .moveTo(MARGIN + COL1_WIDTH + COL2_WIDTH, y)
    .lineTo(MARGIN + COL1_WIDTH + COL2_WIDTH, y + rowHeight)
    .stroke();

  doc.y = y + rowHeight;
}

function drawTable(
  doc: PDFKit.PDFDocument,
  checklist: QAChecklist,
  reviewsByAlertId: Map<string, AlertReviewWithUser>
): void {
  doc
    .fontSize(14)
    .fillColor(COLORS.black)
    .text("Checklist Details", MARGIN, doc.y);
  doc.moveDown(0.5);

  drawTableHeader(doc);

  checklist.items.forEach((item, index) => {
    drawCheckpointRow(doc, item, index, reviewsByAlertId);
  });

  doc
    .strokeColor(COLORS.tableBorder)
    .lineWidth(0.5)
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + CONTENT_WIDTH, doc.y)
    .stroke();
}

function getEffectiveStatus(
  item: QACheckItem,
  reviewsByAlertId: Map<string, AlertReviewWithUser>
): "pass" | "fail" | "na" {
  if (item.status === "fail" && item.relatedAlerts && item.relatedAlerts.length > 0) {
    const allApproved = item.relatedAlerts.every((alert) => {
      const review = reviewsByAlertId.get(alert.id);
      return review?.decision === "approved";
    });
    if (allApproved) return "pass";
  }
  return item.status;
}

function drawCheckpointRow(
  doc: PDFKit.PDFDocument,
  item: QACheckItem,
  index: number,
  reviewsByAlertId: Map<string, AlertReviewWithUser>
): void {
  const effectiveStatus = getEffectiveStatus(item, reviewsByAlertId);

  const col1Text = `${item.checkNumber}. ${item.title}\n[${item.category}]`;
  const inferenceText = effectiveStatus === "pass" ? "Yes" : effectiveStatus === "fail" ? "No" : "N/A";
  const col3Text = item.description + (item.details ? `\n${item.details}` : "");

  const col1Height = calcTextHeight(doc, col1Text, COL1_WIDTH - 15, 10);
  const col3Height = calcTextHeight(doc, col3Text, COL3_WIDTH - 10, 10);
  const rowHeight = Math.max(col1Height, col3Height, 30) + 10;

  ensureSpace(doc, rowHeight + 20);

  if (doc.y <= MARGIN + 5) {
    drawTableHeader(doc);
  }

  const y = doc.y;
  const bgColor = index % 2 === 1 ? COLORS.altRowBg : COLORS.white;

  doc.save().rect(MARGIN, y, CONTENT_WIDTH, rowHeight).fill(bgColor).restore();

  doc
    .strokeColor(COLORS.tableBorder)
    .lineWidth(0.5)
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + CONTENT_WIDTH, y)
    .stroke()
    .moveTo(MARGIN + COL1_WIDTH, y)
    .lineTo(MARGIN + COL1_WIDTH, y + rowHeight)
    .stroke()
    .moveTo(MARGIN + COL1_WIDTH + COL2_WIDTH, y)
    .lineTo(MARGIN + COL1_WIDTH + COL2_WIDTH, y + rowHeight)
    .stroke();

  const statusSymbol = effectiveStatus === "pass" ? "\u2713" : effectiveStatus === "fail" ? "\u2717" : "\u2014";
  const statusColor =
    effectiveStatus === "pass" ? COLORS.pass : effectiveStatus === "fail" ? COLORS.fail : COLORS.na;

  doc
    .fontSize(10)
    .fillColor(statusColor)
    .text(statusSymbol, MARGIN + 5, y + 5, { continued: true })
    .fillColor(COLORS.black)
    .text(` ${item.checkNumber}. ${item.title}`, { width: COL1_WIDTH - 20 });

  doc
    .fontSize(8)
    .fillColor(COLORS.mutedText)
    .text(`[${item.category}]`, MARGIN + 15, doc.y, { width: COL1_WIDTH - 25 });

  const inferenceColor =
    effectiveStatus === "pass" ? COLORS.pass : effectiveStatus === "fail" ? COLORS.fail : COLORS.na;
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(inferenceColor)
    .text(inferenceText, MARGIN + COL1_WIDTH + 5, y + 5 + (rowHeight - 20) / 2, {
      width: COL2_WIDTH - 10,
      align: "center",
    });
  doc.font("Helvetica");

  doc
    .fontSize(9)
    .fillColor(COLORS.mutedText)
    .text(item.description, MARGIN + COL1_WIDTH + COL2_WIDTH + 5, y + 5, {
      width: COL3_WIDTH - 10,
    });

  if (item.details) {
    const detailColor = effectiveStatus === "fail" ? COLORS.fail : COLORS.pass;
    doc
      .fontSize(8)
      .fillColor(detailColor)
      .text(
        effectiveStatus === "pass" && item.status === "fail"
          ? "All issues reviewed and approved"
          : item.details,
        MARGIN + COL1_WIDTH + COL2_WIDTH + 5,
        doc.y,
        { width: COL3_WIDTH - 10 }
      );
  }

  doc.y = y + rowHeight;

  if (item.status === "fail" && item.relatedAlerts && item.relatedAlerts.length > 0) {
    for (const alert of item.relatedAlerts) {
      drawAlertSubRow(doc, alert, reviewsByAlertId);
    }
  }
}

function drawAlertSubRow(
  doc: PDFKit.PDFDocument,
  alert: ValidationAlert,
  reviewsByAlertId: Map<string, AlertReviewWithUser>
): void {
  const review = reviewsByAlertId.get(alert.id);
  const isApproved = review?.decision === "approved";

  const pageNum = alert.source?.pageNumber;
  const headerLine = `${alert.title} | ${alert.severity.toUpperCase()}${pageNum ? ` | Page ${pageNum}` : ""}`;
  const messageLine = alert.message;

  let approvalText = "";
  if (isApproved && review) {
    const reviewerName = review.reviewer
      ? `${review.reviewer.firstName || ""} ${review.reviewer.lastName || ""}`.trim() ||
        review.reviewer.email ||
        "Unknown"
      : "Unknown";
    const reviewDate = new Date(review.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    approvalText = `Approved by ${reviewerName} on ${reviewDate}\n"${review.comment}"`;
  }

  const totalText = headerLine + "\n" + messageLine + (approvalText ? "\n" + approvalText : "");
  const subRowHeight = calcTextHeight(doc, totalText, CONTENT_WIDTH - 30, 8) + 12;

  ensureSpace(doc, subRowHeight + 10);

  if (doc.y <= MARGIN + 5) {
    drawTableHeader(doc);
  }

  const y = doc.y;
  const bgColor = isApproved ? COLORS.approvedBg : COLORS.alertBg;
  const borderColor = isApproved ? COLORS.approvedBorder : COLORS.alertBorder;

  doc
    .save()
    .rect(MARGIN + 15, y, CONTENT_WIDTH - 15, subRowHeight)
    .fill(bgColor)
    .restore();

  doc
    .strokeColor(borderColor)
    .lineWidth(0.5)
    .rect(MARGIN + 15, y, CONTENT_WIDTH - 15, subRowHeight)
    .stroke();

  const sevColor =
    alert.severity === "critical" || alert.severity === "high"
      ? COLORS.fail
      : alert.severity === "medium"
      ? "#d97706"
      : COLORS.mutedText;

  doc
    .fontSize(8)
    .font("Helvetica-Bold")
    .fillColor(isApproved ? COLORS.pass : sevColor)
    .text(
      isApproved ? `\u2713 ${alert.title} (Approved)` : `\u26A0 ${alert.title}`,
      MARGIN + 20,
      y + 4,
      { width: CONTENT_WIDTH - 35, continued: false }
    );

  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(COLORS.mutedText)
    .text(
      `${alert.severity.toUpperCase()}${pageNum ? ` | Page ${pageNum}` : ""}`,
      MARGIN + 20,
      doc.y,
      { width: CONTENT_WIDTH - 35 }
    );

  doc
    .fontSize(8)
    .fillColor(COLORS.black)
    .text(alert.message, MARGIN + 20, doc.y + 2, { width: CONTENT_WIDTH - 35 });

  if (isApproved && approvalText) {
    doc
      .fontSize(7)
      .fillColor(COLORS.pass)
      .text(approvalText, MARGIN + 20, doc.y + 2, { width: CONTENT_WIDTH - 35 });
  }

  doc.y = y + subRowHeight + 2;
}

function calcTextHeight(doc: PDFKit.PDFDocument, text: string, width: number, fontSize: number): number {
  const currentSize = (doc as any)._fontSize;
  doc.fontSize(fontSize);
  const height = doc.heightOfString(text, { width });
  doc.fontSize(currentSize || 10);
  return height;
}

function addFooters(doc: PDFKit.PDFDocument): void {
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    const bottomY = doc.page.height - MARGIN + 10;

    doc
      .fontSize(7)
      .fillColor(COLORS.mutedText)
      .text("Generated by Batch Record Processing System", MARGIN, bottomY, {
        width: CONTENT_WIDTH,
        align: "left",
      });

    doc
      .fontSize(7)
      .fillColor(COLORS.mutedText)
      .text(`Page ${i + 1} of ${pages.count}`, MARGIN, bottomY, {
        width: CONTENT_WIDTH,
        align: "right",
      });
  }
}
