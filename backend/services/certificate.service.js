const crypto = require("crypto");
const PDFDocument = require("pdfkit");
const ApiError = require("../utils/ApiError");
const DocumentStorageService = require("./documentStorage.service");

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function buildCertificatePayload(transaction) {
  return {
    certificateId: transaction.certificate?.certificateId || `CERT-${new Date().getUTCFullYear()}-${transaction.id}`,
    transactionId: transaction.id,
    companyName: transaction.companyName,
    projectName: transaction.projectName,
    registry: transaction.registry || "Gold Standard",
    vintageYear: transaction.vintageYear,
    quantity: transaction.quantity ?? transaction.credits,
    serialNumber: transaction.serialNumber,
    issuedAt: transaction.completedAt || new Date(),
    totalCost: transaction.totalCost ?? transaction.totalCostUsd ?? transaction.total,
    paymentReference: transaction.paymentReference,
  };
}

function buildCertificatePdfBuffer(payload) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 64, bottom: 64, left: 70, right: 70 },
      info: {
        Title: `Carbon Offset Certificate - ${payload.companyName}`,
        Author: "CarbonFlow",
        Subject: "Carbon credit retirement certificate",
      },
    });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const accent = "#0f766e";
    const slate = "#334155";
    const light = "#e2e8f0";
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.rect(0, 0, doc.page.width, 140).fill("#ecfeff");
    doc.fillColor(accent).font("Helvetica-Bold").fontSize(28).text("Carbon Offset Certificate", 0, 52, {
      align: "center",
    });
    doc.moveDown(0.5);
    doc.fillColor(slate).font("Helvetica").fontSize(12).text(
      "This certifies that verified carbon credits have been retired on behalf of the organization below.",
      doc.page.margins.left,
      96,
      {
        width: pageWidth,
        align: "center",
      },
    );

    doc.y = 170;
    doc.roundedRect(doc.page.margins.left, doc.y, pageWidth, 210, 18).lineWidth(1).stroke(light);
    doc.moveDown(1.5);
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(20).text(payload.companyName, {
      align: "center",
    });
    doc.moveDown(0.4);
    doc.fillColor(slate).font("Helvetica").fontSize(12).text("Retired carbon credits from", {
      align: "center",
    });
    doc.moveDown(0.3);
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(18).text(payload.projectName, {
      align: "center",
    });
    doc.moveDown(1.2);

    const detailRows = [
      ["Registry", payload.registry],
      ["Vintage Year", String(payload.vintageYear)],
      ["tCO2e Retired", `${payload.quantity} tCO2e`],
      ["Total Cost", formatCurrency(payload.totalCost)],
      ["Serial Number", payload.serialNumber],
      ["Certificate ID", payload.certificateId],
      ["Issue Date", formatDate(payload.issuedAt)],
      ["Payment Reference", payload.paymentReference],
    ];

    const labelX = doc.page.margins.left + 50;
    const valueX = doc.page.margins.left + 240;
    let rowY = 255;

    detailRows.forEach(([label, value]) => {
      doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(11).text(label, labelX, rowY);
      doc.fillColor("#0f172a").font("Helvetica").fontSize(11).text(value, valueX, rowY, {
        width: 220,
      });
      rowY += 24;
    });

    doc.roundedRect(doc.page.margins.left, 418, pageWidth, 110, 18).fill("#f8fafc");
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(13).text("Authorized Seal", doc.page.margins.left + 30, 445);
    doc.moveTo(doc.page.margins.left + 30, 505).lineTo(doc.page.margins.left + 230, 505).lineWidth(1).stroke("#94a3b8");
    doc.fillColor("#64748b").font("Helvetica").fontSize(10).text("CarbonFlow Climate Registry Operations", doc.page.margins.left + 30, 512);
    doc.circle(doc.page.width - 128, 474, 42).lineWidth(2).stroke(accent);
    doc.fillColor(accent).font("Helvetica-Bold").fontSize(11).text("VERIFIED", doc.page.width - 162, 468, {
      width: 68,
      align: "center",
    });

    const footerY = doc.page.height - 78;
    doc.moveTo(doc.page.margins.left, footerY).lineTo(doc.page.width - doc.page.margins.right, footerY).stroke("#cbd5e1");
    doc.fillColor("#64748b").font("Helvetica").fontSize(9).text(
      "Verification note: Retired credits are recorded in CarbonFlow for audit and compliance review.",
      doc.page.margins.left,
      footerY + 12,
      { width: pageWidth, align: "center" },
    );
    doc.text(`Serial: ${payload.serialNumber}`, doc.page.margins.left, footerY + 28, {
      width: pageWidth,
      align: "center",
    });

    doc.end();
  });
}

class CertificateService {
  static async generateCertificate(transaction, options = {}) {
    const { allowRegeneration = false } = options;

    if (!transaction || transaction.status !== "COMPLETED") {
      throw new ApiError(409, "Certificates can only be generated for completed transactions.");
    }

    if (transaction.certificate?.certificateUrl && transaction.certificate?.storagePath && !allowRegeneration) {
      await DocumentStorageService.readCertificate(transaction.certificate.storagePath);

      return {
        transactionId: transaction.id,
        issuedAt: transaction.certificate.issuedAt,
        certificateUrl: transaction.certificate.certificateUrl,
        checksum: transaction.certificate.checksum,
        certificateId: transaction.certificate.certificateId,
      };
    }

    if (transaction.certificate?.certificateUrl && !allowRegeneration) {
      throw new ApiError(409, "Certificate regeneration is not authorized for this transaction.");
    }

    const payload = buildCertificatePayload(transaction);
    const pdfBuffer = await buildCertificatePdfBuffer(payload);
    const checksum = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
    const saved = await DocumentStorageService.saveCertificate(transaction.id, pdfBuffer);

    return {
      transactionId: transaction.id,
      issuedAt: payload.issuedAt,
      certificateUrl: `/api/credits/${transaction.id}/certificate`,
      checksum,
      certificateId: payload.certificateId,
      storagePath: saved.storagePath,
      fileName: saved.fileName,
    };
  }

  static async generateCarbonCertificate(transaction, options = {}) {
    return this.generateCertificate(transaction, options);
  }
}

module.exports = CertificateService;
