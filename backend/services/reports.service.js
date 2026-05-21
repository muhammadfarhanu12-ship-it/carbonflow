const { Report, Shipment, Supplier, Setting, Transaction, EmissionRecord } = require("../models");
const BaseService = require("./base.service");
const PDFDocument = require("pdfkit");
const DashboardService = require("./dashboard.service");
const AuditService = require("./audit.service");

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function sanitizeCsvCell(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

class ReportsService extends BaseService {
  static list(query = {}, companyId) {
    const filter = { companyId, ...this.getLikeFilter(["name", "type", "format"], query.search) };
    return this.buildListResult(Report, { query, filter, sort: { generatedAt: -1 } });
  }

  static async generate(payload, companyId, actor = null) {
    const type = String(payload.type || "").toUpperCase();
    const format = String(payload.format || "PDF").toUpperCase();
    const allowedTypes = ["ESG", "COMPLIANCE", "ANALYTICS", "CUSTOM"];
    const allowedFormats = ["CSV", "PDF"];

    if (!payload.name || !allowedTypes.includes(type) || !allowedFormats.includes(format)) {
      const error = new Error("Report name, valid type, and valid format are required");
      error.status = 422;
      throw error;
    }

    const recordSelection = payload.recordSelection || payload.metadata?.recordSelection || "approved_only";
    const includeUnapproved = recordSelection === "all_records" || payload.metadata?.includeUnapproved === true;
    const includeDrafts = includeUnapproved && payload.metadata?.includeDrafts === true;
    const metadata = {
      ...(payload.metadata || {}),
      recordSelection,
      includeDrafts,
      approvedOnly: includeUnapproved ? false : payload.metadata?.approvedOnly !== false,
    };
    if (metadata.approvedOnly === false) {
      metadata.warning = "This report includes unapproved emission records and is not enterprise-assurance ready.";
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const report = await Report.create({
      companyId,
      name: payload.name,
      type,
      format,
      status: "READY",
      generatedAt: new Date(),
      downloadUrl: `/api/reports/download/${timestamp}.${format.toLowerCase()}`,
      metadata,
    });

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: metadata.generatedFrom === "carbon_ledger" ? "report_generated_from_ledger" : "report_generated",
      entityType: "Report",
      entityId: report.id,
      ipAddress: actor?.ipAddress || null,
      userAgent: actor?.userAgent || null,
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

  static buildDashboardForReport(dashboard, records) {
    const scopeSummary = records.reduce((accumulator, record) => {
      const amount = Number(record.emissionsTCo2e ?? record.amountTonnes ?? 0);
      accumulator.totalEmissions += amount;
      if (record.scope === 1) accumulator.scope1 += amount;
      if (record.scope === 2) accumulator.scope2 += amount;
      if (record.scope === 3) accumulator.scope3 += amount;
      return accumulator;
    }, { totalEmissions: 0, scope1: 0, scope2: 0, scope3: 0 });

    const categoryMap = new Map();
    const monthlyMap = new Map();
    records.forEach((record) => {
      const name = record.category || "Uncategorized";
      const bucket = categoryMap.get(name) || { name, value: 0, scope1: 0, scope2: 0, scope3: 0 };
      const amount = Number(record.emissionsTCo2e ?? record.amountTonnes ?? 0);
      bucket.value = round(bucket.value + amount);
      if (record.scope === 1) bucket.scope1 = round(bucket.scope1 + amount);
      if (record.scope === 2) bucket.scope2 = round(bucket.scope2 + amount);
      if (record.scope === 3) bucket.scope3 = round(bucket.scope3 + amount);
      categoryMap.set(name, bucket);

      const occurredAt = new Date(record.occurredAt || Date.now());
      const year = record.periodYear || occurredAt.getUTCFullYear();
      const month = record.periodMonth || occurredAt.getUTCMonth() + 1;
      const key = `${year}-${String(month).padStart(2, "0")}`;
      const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
      const monthlyBucket = monthlyMap.get(key) || { name: monthName, scope1: 0, scope2: 0, scope3: 0, emissions: 0, cost: 0 };
      monthlyBucket.emissions = round(monthlyBucket.emissions + amount);
      if (record.scope === 1) monthlyBucket.scope1 = round(monthlyBucket.scope1 + amount);
      if (record.scope === 2) monthlyBucket.scope2 = round(monthlyBucket.scope2 + amount);
      if (record.scope === 3) monthlyBucket.scope3 = round(monthlyBucket.scope3 + amount);
      monthlyMap.set(key, monthlyBucket);
    });
    const monthly = Array.from(monthlyMap.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, value]) => value);

    return {
      ...dashboard,
      summary: {
        ...dashboard.summary,
        totalEmissions: round(scopeSummary.totalEmissions),
        scope1: round(scopeSummary.scope1),
        scope2: round(scopeSummary.scope2),
        scope3: round(scopeSummary.scope3),
        activitiesRecorded: records.length,
        totalRecords: records.length,
        approvedRecords: records.filter((record) => record.dataStatus === "approved").length,
        unapprovedRecords: records.filter((record) => record.dataStatus !== "approved").length,
      },
      scopeBreakdown: [
        { name: "Scope 1", value: round(scopeSummary.scope1), percentage: scopeSummary.totalEmissions ? round((scopeSummary.scope1 / scopeSummary.totalEmissions) * 100, 2) : 0 },
        { name: "Scope 2", value: round(scopeSummary.scope2), percentage: scopeSummary.totalEmissions ? round((scopeSummary.scope2 / scopeSummary.totalEmissions) * 100, 2) : 0 },
        { name: "Scope 3", value: round(scopeSummary.scope3), percentage: scopeSummary.totalEmissions ? round((scopeSummary.scope3 / scopeSummary.totalEmissions) * 100, 2) : 0 },
      ],
      categories: Array.from(categoryMap.values()).sort((left, right) => right.value - left.value).slice(0, 8),
      monthly,
      costVsEmissions: monthly.map((entry) => ({
        name: entry.name,
        cost: entry.cost,
        emissions: entry.emissions,
      })),
    };
  }

  static async buildDataset(companyId, metadata = {}) {
    const approvedOnly = metadata.includeUnapproved === true ? false : metadata.approvedOnly !== false;
    const recordFilter = approvedOnly ? { companyId, dataStatus: "approved" } : { companyId };
    if (!approvedOnly && metadata.includeDrafts === false) {
      recordFilter.dataStatus = { $ne: "draft" };
    }
    if (metadata.periodStart || metadata.periodEnd) {
      recordFilter.occurredAt = {};
      if (metadata.periodStart) recordFilter.occurredAt.$gte = new Date(metadata.periodStart);
      if (metadata.periodEnd) recordFilter.occurredAt.$lte = new Date(metadata.periodEnd);
    }
    const [dashboard, shipments, suppliers, settings, offsetTransactions, emissionRecords] = await Promise.all([
      DashboardService.getMetrics(companyId),
      Shipment.find({ companyId }).sort({ createdAt: -1 }).limit(10),
      Supplier.find({ companyId }).sort({ createdAt: -1 }).limit(10),
      Setting.findOne({ companyId }),
      Transaction.find({ companyId, status: "COMPLETED" }).sort({ retiredAt: -1 }).limit(10),
      EmissionRecord.find(recordFilter).sort({ occurredAt: -1 }).limit(500).lean(),
    ]);
    const supplierMap = new Map(suppliers.map((supplier) => [String(supplier._id || supplier.id), supplier]));
    const totalEmissions = emissionRecords.reduce((sum, record) => sum + Number(record.emissionsTCo2e ?? record.amountTonnes ?? 0), 0);
    const supplierBreakdownMap = new Map();
    emissionRecords.forEach((record) => {
      const amount = Number(record.emissionsTCo2e ?? record.amountTonnes ?? 0);
      if (!record.supplierId && !record.activityData?.supplierName) return;
      const linked = Boolean(record.supplierId);
      const key = linked ? String(record.supplierId) : `metadata:${record.activityData?.supplierName}`;
      const supplier = linked ? supplierMap.get(key) : null;
      const bucket = supplierBreakdownMap.get(key) || {
        supplierId: linked ? key : null,
        name: supplier?.name || record.activityData?.supplierName || "Unverified supplier link",
        category: supplier?.category || record.activityData?.supplierCategory || null,
        country: supplier?.country || record.activityData?.supplierCountry || null,
        riskLevel: supplier?.riskLevel || record.activityData?.supplierRiskLevel || null,
        linkStatus: linked ? "linked" : "unverified",
        value: 0,
        recordCount: 0,
        sharePct: 0,
      };
      bucket.value = round(bucket.value + amount);
      bucket.recordCount += 1;
      supplierBreakdownMap.set(key, bucket);
    });
    const supplierBreakdown = Array.from(supplierBreakdownMap.values())
      .map((item) => ({ ...item, sharePct: totalEmissions ? round((item.value / totalEmissions) * 100, 2) : 0 }))
      .sort((left, right) => right.value - left.value);
    const governance = await Promise.all(emissionRecords.map((record) => (
      require("./emissionRecord.service").buildFactorGovernance(record, companyId)
    )));
    const staleFactorRecords = governance.filter((item) => item.isStaleFactor).length;
    const statusSummary = emissionRecords.reduce((accumulator, record) => {
      const status = record.dataStatus || "draft";
      accumulator[status] = (accumulator[status] || 0) + 1;
      return accumulator;
    }, {});
    const sampleFactorRecords = emissionRecords.filter((record) => record.factorIsSample === true).length;
    const missingFactorRecords = emissionRecords.filter((record) => !record.factorValue || !record.factorUnit).length;

    return {
      dashboard: this.buildDashboardForReport(dashboard, emissionRecords),
      shipments,
      suppliers,
      settings,
      offsetTransactions,
      emissionRecords,
      supplierBreakdown,
      dataQualityNotes: {
        sampleFactorRecords,
        missingFactorRecords,
        staleFactorRecords,
        unapprovedRecords: emissionRecords.filter((record) => record.dataStatus !== "approved").length,
        statusSummary,
      },
      recordSelection: approvedOnly ? "approved_only" : "all_records",
    };
  }

  static buildCsv(report, dataset) {
    const dataQualityNotes = dataset.dataQualityNotes || {
      sampleFactorRecords: 0,
      missingFactorRecords: 0,
      staleFactorRecords: 0,
      unapprovedRecords: 0,
      statusSummary: {},
    };
    const supplierBreakdown = dataset.supplierBreakdown || [];
    const summaryRows = [
      ["Report Name", report.name],
      ["Type", report.type],
      ["Format", report.format],
      ["Generated At", report.generatedAt.toISOString()],
      ["Company", dataset.settings?.companyName || "CarbonFlow"],
      ["Reporting Period", report.metadata?.period || report.metadata?.reportingPeriod || "All available records"],
      ["Record Selection", dataset.recordSelection === "approved_only" ? "Approved records only" : "All records"],
      ...(dataset.recordSelection === "approved_only" ? [] : [["Warning", "This report includes unapproved records and should not be used for final enterprise reporting without review."]]),
      ...(dataQualityNotes.sampleFactorRecords ? [["Sample Factor Warning", `${dataQualityNotes.sampleFactorRecords} records use sample factors. Do not present sample factors as official.`]] : []),
      ...(dataQualityNotes.missingFactorRecords ? [["Missing Factor Warning", `${dataQualityNotes.missingFactorRecords} records are missing factor data.`]] : []),
      ...(dataQualityNotes.staleFactorRecords ? [["Stale Factor Warning", `${dataQualityNotes.staleFactorRecords} records use inactive or outdated factor snapshots.`]] : []),
      ["Total Emissions (tCO2e)", dataset.dashboard.summary.totalEmissions],
      ["Scope 1 (tCO2e)", dataset.dashboard.summary.scope1],
      ["Scope 2 (tCO2e)", dataset.dashboard.summary.scope2],
      ["Scope 3 (tCO2e)", dataset.dashboard.summary.scope3],
      ["Total Logistics Cost (USD)", dataset.dashboard.summary.totalCost],
      ["High Risk Suppliers", dataset.dashboard.summary.highRiskSuppliers],
      ["Offsets Retired", dataset.dashboard.summary.totalOffsets],
      ["Data Completeness (%)", dataset.dashboard.summary.dataCompletenessPct],
      ["Activities Recorded", dataset.dashboard.summary.activitiesRecorded],
      ["Reports Generated", dataset.dashboard.summary.reportsGenerated],
      [],
      ["Scope Split"],
      ["Scope", "tCO2e", "Percent"],
      ...dataset.dashboard.scopeBreakdown.map((item) => [item.name, item.value, item.percentage]),
      [],
      ["Category Breakdown"],
      ["Category", "Scope 1", "Scope 2", "Scope 3", "Total tCO2e"],
      ...dataset.dashboard.categories.map((item) => [item.name, item.scope1, item.scope2, item.scope3, item.value]),
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
      ["Supplier Breakdown"],
      ["Supplier", "Link Status", "Category", "Country", "Risk Level", "Record Count", "Total tCO2e", "Share %"],
      ...supplierBreakdown.map((supplier) => [
        supplier.name,
        supplier.linkStatus,
        supplier.category || "",
        supplier.country || "",
        supplier.riskLevel || "",
        supplier.recordCount,
        supplier.value,
        supplier.sharePct,
      ]),
      [],
      ["Approved/Draft Status Summary"],
      ["Status", "Record Count"],
      ...Object.entries(dataQualityNotes.statusSummary).map(([status, count]) => [status, count]),
      [],
      ["Methodology"],
      ["Formula", "emissions = activity data x emission factor"],
      ["Output Units", "kgCO2e and tCO2e"],
      ["Factor Note", "Records flagged as sample factors are MVP placeholders and should be replaced with official DEFRA/EPA/IPCC/GHG Protocol factors before formal assurance."],
      ["Sample Factor Disclaimer", "This MVP uses sample emission factors. Replace with official factors before production use."],
      ["Data Quality", `${dataset.dashboard.dataQuality.completedSignals}/${dataset.dashboard.dataQuality.requiredSignals} completeness signals available; ${dataset.dashboard.dataQuality.sampleFactorRecords} records use sample factors.`],
      [],
      ["Emission Activity Calculation Detail"],
      ["Date", "Reporting Period", "Status", "Scope", "Category", "Supplier", "Activity Amount", "Activity Unit", "Emission Factor", "Factor Unit", "Factor Source", "Factor Year", "Factor Region", "Factor Country", "Sample Factor", "Formula", "kgCO2e", "tCO2e"],
      ...dataset.emissionRecords.map((record) => [
        record.occurredAt ? new Date(record.occurredAt).toISOString() : "",
        record.reportingPeriod || `${record.periodYear || ""}-${String(record.periodMonth || "").padStart(2, "0")}`,
        record.dataStatus || "draft",
        `Scope ${record.scope}`,
        record.category,
        record.activityData?.supplierName || "",
        record.activityAmount ?? record.activityData?.electricityKwh ?? record.activityData?.tonKm ?? "",
        record.activityUnit || record.factorUnit || "",
        record.factorValue,
        record.factorUnit,
        record.factorSource || "CarbonFlow sample factors",
        record.factorSourceYear || "",
        record.factorRegion || record.metadata?.region || "",
        record.factorCountry || "",
        record.factorIsSample !== false ? "Yes" : "No",
        record.activityData?.calculationFormula || "emissions = activity data x emission factor",
        record.emissionsKgCo2e ?? Number(record.amountTonnes || 0) * 1000,
        record.emissionsTCo2e ?? record.amountTonnes,
      ]),
      [],
      ["Reduction Recommendations"],
      ["1", "Prioritize the top emitting categories shown in the category breakdown."],
      ["2", "Replace sample factors with region and supplier-specific official factors."],
      ["3", "Collect facility/business-unit data for higher quality enterprise reporting."],
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
      .map((row) => row.map((value) => `"${sanitizeCsvCell(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");
  }

  static buildPdf(report, dataset) {
    const dataQualityNotes = dataset.dataQualityNotes || {
      sampleFactorRecords: 0,
      missingFactorRecords: 0,
      unapprovedRecords: 0,
      statusSummary: {},
    };
    const supplierBreakdown = dataset.supplierBreakdown || [];
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
      doc.text(`Reporting period: ${report.metadata?.period || report.metadata?.reportingPeriod || "All available records"}`);
      doc.text(`Record selection: ${dataset.recordSelection === "approved_only" ? "Approved records only" : "All records"}`);
      if (dataset.recordSelection !== "approved_only") {
        doc.fillColor("#92400e").text("Warning: this report includes unapproved records and should not be used for final enterprise reporting without review.");
        doc.fillColor("#111827");
      }
      doc.text(`Total emissions: ${dataset.dashboard.summary.totalEmissions} tCO2e`);
      doc.text(`Scope 1: ${dataset.dashboard.summary.scope1} tCO2e`);
      doc.text(`Scope 2: ${dataset.dashboard.summary.scope2} tCO2e`);
      doc.text(`Scope 3: ${dataset.dashboard.summary.scope3} tCO2e`);
      doc.text(`Total logistics cost: $${dataset.dashboard.summary.totalCost}`);
      doc.text(`High risk suppliers: ${dataset.dashboard.summary.highRiskSuppliers}`);
      doc.text(`Offsets retired: ${dataset.dashboard.summary.totalOffsets}`);
      doc.text(`Data completeness: ${dataset.dashboard.summary.dataCompletenessPct || 0}%`);
      doc.text(`Activities recorded: ${dataset.dashboard.summary.activitiesRecorded || 0}`);
      doc.moveDown();
      doc.fontSize(14).text("Scope Breakdown");
      doc.fontSize(10);
      dataset.dashboard.scopeBreakdown.forEach((item) => {
        doc.text(`${item.name}: ${item.value} tCO2e (${item.percentage}%)`);
      });
      doc.moveDown();
      doc.fontSize(14).text("Category Breakdown");
      doc.fontSize(10);
      dataset.dashboard.categories.forEach((item) => {
        doc.text(`${item.name}: ${item.value} tCO2e | S1 ${item.scope1} | S2 ${item.scope2} | S3 ${item.scope3}`);
      });
      doc.moveDown();
      doc.fontSize(14).text("Monthly Trend");
      doc.fontSize(10);
      dataset.dashboard.monthly.forEach((month) => {
        doc.text(`${month.name} | S1 ${month.scope1} | S2 ${month.scope2} | S3 ${month.scope3} | Emissions ${month.emissions} tCO2e | Cost $${month.cost}`);
      });
      doc.moveDown();
      doc.fontSize(14).text("Supplier Breakdown");
      doc.fontSize(10);
      if (!supplierBreakdown.length) {
        doc.text("No supplier-linked records in this report.");
      }
      supplierBreakdown.forEach((supplier) => {
        doc.text(`${supplier.name} | ${supplier.linkStatus} | ${supplier.value} tCO2e | ${supplier.recordCount} records | ${supplier.sharePct}% | Risk ${supplier.riskLevel || "-"}`);
      });
      doc.moveDown();
      doc.fontSize(14).text("Approved/Draft Status Summary");
      doc.fontSize(10);
      Object.entries(dataQualityNotes.statusSummary).forEach(([status, count]) => {
        doc.text(`${status}: ${count}`);
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
      doc.moveDown();
      doc.fontSize(14).text("Methodology");
      doc.fontSize(10);
      doc.text("Calculations follow: emissions = activity data x emission factor. Results are normalized to kgCO2e and tCO2e.");
      doc.text("Scope 1 covers direct operations, Scope 2 covers purchased energy, and Scope 3 covers value-chain activity including shipments, suppliers, travel, commuting, purchased goods, waste, and transport categories when recorded.");
      doc.moveDown();
      doc.fontSize(14).text("Emission Factor Notes");
      doc.fontSize(10);
      doc.text("CarbonFlow sample factors are MVP placeholders. Replace them with official DEFRA, EPA, IPCC, GHG Protocol, grid, supplier, or assured internal factors before formal reporting.");
      doc.text("This MVP uses sample emission factors. Replace with official factors before production use.");
      if (dataQualityNotes.missingFactorRecords) {
        doc.fillColor("#991b1b").text(`Missing factor warning: ${dataQualityNotes.missingFactorRecords} records are missing factor data.`);
        doc.fillColor("#111827");
      }
      if (dataQualityNotes.staleFactorRecords) {
        doc.fillColor("#92400e").text(`Stale factor warning: ${dataQualityNotes.staleFactorRecords} records use inactive or outdated factor snapshots.`);
        doc.fillColor("#111827");
      }
      doc.moveDown();
      doc.fontSize(14).text("Data Quality Notes");
      doc.fontSize(10);
      doc.text(`Completeness status: ${dataset.dashboard.dataQuality.status}. Sample factor records: ${dataset.dashboard.dataQuality.sampleFactorRecords}. Missing factor records: ${dataset.dashboard.dataQuality.missingFactorRecords}.`);
      doc.moveDown();
      doc.fontSize(14).text("Emission Activity Calculation Detail");
      doc.fontSize(8);
      dataset.emissionRecords.slice(0, 25).forEach((record) => {
        const kgCo2e = record.emissionsKgCo2e ?? Number(record.amountTonnes || 0) * 1000;
        const tCo2e = record.emissionsTCo2e ?? record.amountTonnes;
        doc.text(`${record.reportingPeriod || ""} | ${record.dataStatus || "draft"} | Scope ${record.scope} | ${record.category} | Activity ${record.activityAmount ?? ""} ${record.activityUnit || ""} | Factor ${record.factorValue || 0} ${record.factorUnit || ""} | Source ${record.factorSource || "CarbonFlow sample factors"} ${record.factorSourceYear || ""} ${record.factorRegion || ""} | Sample ${record.factorIsSample !== false ? "Yes" : "No"} | kgCO2e ${kgCo2e} | tCO2e ${tCo2e}`);
      });
      doc.moveDown();
      doc.fontSize(14).text("Reduction Recommendations");
      doc.fontSize(10);
      doc.text("1. Prioritize abatement in the highest emitting categories and facilities.");
      doc.text("2. Collect supplier and facility-specific activity data to improve completeness.");
      doc.text("3. Replace sample factors with official, region-specific factors and document source years.");

      doc.end();
    });
  }

  static async buildDownload(fileName, companyId) {
    const report = await this.getByFileName(fileName, companyId);
    const dataset = await this.buildDataset(companyId, report.metadata || {});

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
