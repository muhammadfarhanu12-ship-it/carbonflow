const { Report, Shipment, Supplier, Setting, Transaction } = require("../models");
const BaseService = require("./base.service");
const PDFDocument = require("pdfkit");
const DashboardService = require("./dashboard.service");
const AuditService = require("./audit.service");

class ReportsService extends BaseService {
  static list(query = {}, companyId) {
    const filter = { companyId, ...this.getLikeFilter(["name", "type", "format"], query.search) };
    return this.buildListResult(Report, { query, filter, sort: { generatedAt: -1 } });
  }

  static async generate(payload, companyId, actor = null) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const report = await Report.create({
      companyId,
      name: payload.name,
      type: payload.type,
      format: payload.format,
      status: "READY",
      generatedAt: new Date(),
      downloadUrl: `/api/reports/download/${timestamp}.${payload.format.toLowerCase()}`,
      metadata: payload.metadata || {},
    });

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "report.generated",
      entityType: "Report",
      entityId: report.id,
      details: {
        type: report.type,
        format: report.format,
      },
    });

    return report;
  }

  static async getByFileName(fileName, companyId) {
    const report = await Report.findOne({
      companyId,
      downloadUrl: { $regex: `${fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });

    if (!report) {
      const error = new Error("Report not found");
      error.status = 404;
      throw error;
    }

    return report;
  }

  static async buildDataset(companyId) {
    const [dashboard, shipments, suppliers, settings, offsetTransactions] = await Promise.all([
      DashboardService.getMetrics(companyId),
      Shipment.find({ companyId }).sort({ createdAt: -1 }).limit(10),
      Supplier.find({ companyId }).sort({ createdAt: -1 }).limit(10),
      Setting.findOne({ companyId }),
      Transaction.find({ companyId, status: "COMPLETED" }).sort({ retiredAt: -1 }).limit(10),
    ]);

    return { dashboard, shipments, suppliers, settings, offsetTransactions };
  }

  static buildCsv(report, dataset) {
    const summaryRows = [
      ["Report Name", report.name],
      ["Type", report.type],
      ["Format", report.format],
      ["Generated At", report.generatedAt.toISOString()],
      ["Company", dataset.settings?.companyName || "CarbonFlow"],
      ["Total Emissions (tCO2e)", dataset.dashboard.summary.totalEmissions],
      ["Scope 1 (tCO2e)", dataset.dashboard.summary.scope1],
      ["Scope 2 (tCO2e)", dataset.dashboard.summary.scope2],
      ["Scope 3 (tCO2e)", dataset.dashboard.summary.scope3],
      ["Total Logistics Cost (USD)", dataset.dashboard.summary.totalCost],
      ["High Risk Suppliers", dataset.dashboard.summary.highRiskSuppliers],
      ["Offsets Retired", dataset.dashboard.summary.totalOffsets],
      [],
      ["Monthly Trend"],
      ["Month", "Scope 1", "Scope 2", "Scope 3", "Emissions", "Cost"],
      ...dataset.dashboard.monthly.map((month) => [
        month.name,
        month.scope1,
        month.scope2,
        month.scope3,
        month.emissions,
        month.cost,
      ]),
      [],
      ["Recent Shipments"],
      ["Reference", "Origin", "Destination", "Mode", "Carrier", "Emissions", "Status"],
      ...dataset.shipments.map((shipment) => [
        shipment.reference,
        shipment.origin,
        shipment.destination,
        shipment.transportMode,
        shipment.carrier,
        shipment.emissionsTonnes,
        shipment.status,
      ]),
      [],
      ["Suppliers"],
      ["Name", "Region", "Category", "Carbon Score", "Risk Level"],
      ...dataset.suppliers.map((supplier) => [
        supplier.name,
        supplier.region,
        supplier.category,
        supplier.carbonScore,
        supplier.riskLevel,
      ]),
      [],
      ["Offset Transactions"],
      ["Project", "Credits", "Total Cost", "Retired At"],
      ...dataset.offsetTransactions.map((transaction) => [
        transaction.metadata?.projectName || transaction.projectId || "Offset project",
        transaction.credits,
        transaction.totalCostUsd || transaction.total,
        transaction.retiredAt ? new Date(transaction.retiredAt).toISOString() : "",
      ]),
    ];

    return summaryRows
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
  }

  static buildPdf(report, dataset) {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      doc.fontSize(20).text(report.name);
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor("#4b5563").text(`Generated ${report.generatedAt.toISOString()}`);
      doc.moveDown();
      doc.fillColor("#111827").fontSize(14).text("Executive Summary");
      doc.fontSize(11);
      doc.text(`Company: ${dataset.settings?.companyName || "CarbonFlow"}`);
      doc.text(`Total emissions: ${dataset.dashboard.summary.totalEmissions} tCO2e`);
      doc.text(`Scope 1: ${dataset.dashboard.summary.scope1} tCO2e`);
      doc.text(`Scope 2: ${dataset.dashboard.summary.scope2} tCO2e`);
      doc.text(`Scope 3: ${dataset.dashboard.summary.scope3} tCO2e`);
      doc.text(`Total logistics cost: $${dataset.dashboard.summary.totalCost}`);
      doc.text(`High risk suppliers: ${dataset.dashboard.summary.highRiskSuppliers}`);
      doc.text(`Offsets retired: ${dataset.dashboard.summary.totalOffsets}`);
      doc.moveDown();
      doc.fontSize(14).text("Monthly Trend");
      doc.fontSize(10);
      dataset.dashboard.monthly.forEach((month) => {
        doc.text(`${month.name} | S1 ${month.scope1} | S2 ${month.scope2} | S3 ${month.scope3} | Emissions ${month.emissions} tCO2e | Cost $${month.cost}`);
      });
      doc.moveDown();
      doc.fontSize(14).text("Recent Shipments");
      doc.fontSize(10);
      dataset.shipments.forEach((shipment) => {
        doc.text(`${shipment.reference} | ${shipment.origin} -> ${shipment.destination} | ${shipment.transportMode} | ${shipment.emissionsTonnes} tCO2e | ${shipment.status}`);
      });
      doc.moveDown();
      doc.fontSize(14).text("Recent Suppliers");
      doc.fontSize(10);
      dataset.suppliers.forEach((supplier) => {
        doc.text(`${supplier.name} | ${supplier.region} | Score ${supplier.carbonScore} | Risk ${supplier.riskLevel}`);
      });
      doc.moveDown();
      doc.fontSize(14).text("Offset Activity");
      doc.fontSize(10);
      dataset.offsetTransactions.forEach((transaction) => {
        doc.text(`${transaction.metadata?.projectName || transaction.projectId} | ${transaction.credits} credits | $${transaction.totalCostUsd || transaction.total}`);
      });

      doc.end();
    });
  }

  static async buildDownload(fileName, companyId) {
    const report = await this.getByFileName(fileName, companyId);
    const dataset = await this.buildDataset(companyId);

    if (report.format === "CSV") {
      return {
        fileName,
        contentType: "text/csv; charset=utf-8",
        content: this.buildCsv(report, dataset),
      };
    }

    return {
      fileName,
      contentType: "application/pdf",
      content: await this.buildPdf(report, dataset),
    };
  }
}

module.exports = ReportsService;
