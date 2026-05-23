const PDFDocument = require("pdfkit");
const { Report, Shipment, Supplier, Setting, Transaction, EmissionRecord, AuditLog } = require("../models");
const BaseService = require("./base.service");
const DashboardService = require("./dashboard.service");
const AuditService = require("./audit.service");
const EmissionRecordService = require("./emissionRecord.service");
const ApiError = require("../utils/ApiError");

const REPORT_TYPES = {
  ESG: "esg_pdf",
  COMPLIANCE: "scope_export_csv",
  ANALYTICS: "carbon_ledger",
  CUSTOM: "custom_extract",
  esg_pdf: "esg_pdf",
  scope_export_csv: "scope_export_csv",
  custom_extract: "custom_extract",
  carbon_ledger: "carbon_ledger",
  supplier_esg: "supplier_esg",
  shipment_emissions: "shipment_emissions",
  marketplace_retirement: "marketplace_retirement",
};
const LEGACY_TYPES = {
  esg_pdf: "ESG",
  scope_export_csv: "COMPLIANCE",
  custom_extract: "CUSTOM",
  carbon_ledger: "ANALYTICS",
  supplier_esg: "ESG",
  shipment_emissions: "COMPLIANCE",
  marketplace_retirement: "COMPLIANCE",
};
const OUTPUT_FORMATS = new Set(["PDF", "CSV", "JSON"]);
const REPORT_STATUSES = {
  READY: "completed",
  PROCESSING: "generating",
  FAILED: "failed",
};

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function normalizeReportType(value) {
  const key = String(value || "").trim();
  const normalized = REPORT_TYPES[key] || REPORT_TYPES[key.toUpperCase()];
  if (!normalized) {
    throw new ApiError(422, "A valid report type is required.");
  }
  return normalized;
}

function normalizeLegacyType(reportType) {
  return LEGACY_TYPES[reportType] || "CUSTOM";
}

function normalizeFormat(value, reportType = "esg_pdf") {
  const fallback = reportType === "scope_export_csv" || reportType === "custom_extract" ? "CSV" : "PDF";
  const normalized = String(value || fallback).trim().toUpperCase();
  if (!OUTPUT_FORMATS.has(normalized)) {
    throw new ApiError(422, "A valid output format is required.");
  }
  return normalized;
}

function normalizeInclusionPolicy(payload = {}) {
  const requested = String(payload.inclusionPolicy || payload.recordSelection || payload.metadata?.recordSelection || "").trim();
  if (requested === "all_records" || requested === "all_records_with_warning" || payload.metadata?.includeUnapproved === true) {
    return "all_records_with_warning";
  }
  return "approved_only";
}

function normalizeDate(value, fieldName) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(422, `${fieldName} must be a valid date.`);
  }
  return date;
}

function normalizePeriod(payload = {}) {
  const start = normalizeDate(payload.reportingPeriodStart || payload.periodStart || payload.metadata?.periodStart, "reportingPeriodStart");
  const end = normalizeDate(payload.reportingPeriodEnd || payload.periodEnd || payload.metadata?.periodEnd, "reportingPeriodEnd");
  if (start && end && start > end) {
    throw new ApiError(422, "reportingPeriodStart must be before reportingPeriodEnd.");
  }
  return { start, end };
}

function sanitizeCsvCell(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvRow(row) {
  return row.map((value) => `"${sanitizeCsvCell(value).replace(/"/g, '""')}"`).join(",");
}

function serializeReport(report) {
  const record = typeof report?.toJSON === "function" ? report.toJSON() : { ...report };
  const reportType = record.reportType || REPORT_TYPES[record.type] || String(record.type || "").toLowerCase();
  const outputFormat = String(record.outputFormat || record.format || "PDF").toUpperCase();
  const status = REPORT_STATUSES[record.status] || record.status || "completed";
  return {
    ...record,
    id: record.id || record._id,
    name: record.reportName || record.name,
    reportName: record.reportName || record.name,
    type: record.type || normalizeLegacyType(reportType),
    reportType,
    format: outputFormat,
    outputFormat,
    status,
    generatedAt: record.generatedAt || record.createdAt,
    downloadUrl: record.downloadUrl || `/api/reports/${record.id || record._id}/download`,
    warnings: record.metadata?.warnings || [],
  };
}

function getRecordTonnes(record) {
  return Number(record.emissionsTCo2e ?? record.amountTonnes ?? 0);
}

function buildRecordFilter(companyId, metadata = {}) {
  const approvedOnly = metadata.inclusionPolicy !== "all_records_with_warning" && metadata.includeUnapproved !== true;
  const filter = approvedOnly ? { companyId, dataStatus: "approved" } : { companyId };
  if (metadata.reportingPeriodStart || metadata.periodStart || metadata.reportingPeriodEnd || metadata.periodEnd) {
    filter.occurredAt = {};
    const start = metadata.reportingPeriodStart || metadata.periodStart;
    const end = metadata.reportingPeriodEnd || metadata.periodEnd;
    if (start) filter.occurredAt.$gte = new Date(start);
    if (end) filter.occurredAt.$lte = new Date(end);
  }
  return filter;
}

function buildReadinessSummary(records) {
  const counts = {
    approvedRecordsCount: 0,
    draftRecordsCount: 0,
    submittedRecordsCount: 0,
    rejectedRecordsCount: 0,
    needsCorrectionRecordsCount: 0,
    missingFactorCount: 0,
    sampleFactorCount: 0,
    staleFactorCount: 0,
    zeroAmountCount: 0,
    calculationErrorCount: 0,
    supplierLinkedCount: 0,
    unlinkedSupplierCount: 0,
    officialFactorCount: 0,
    customFactorCount: 0,
  };

  records.forEach((record) => {
    const status = String(record.dataStatus || "draft").toLowerCase();
    if (status === "approved") counts.approvedRecordsCount += 1;
    if (status === "draft") counts.draftRecordsCount += 1;
    if (status === "submitted") counts.submittedRecordsCount += 1;
    if (status === "rejected") counts.rejectedRecordsCount += 1;
    if (status === "needs_correction") counts.needsCorrectionRecordsCount += 1;
    if (record.calculationStatus === "missing_factor" || record.factorValue === null || record.factorValue === undefined) counts.missingFactorCount += 1;
    if (record.factorIsSample === true) counts.sampleFactorCount += 1;
    if (record.factorIsOfficial === true) counts.officialFactorCount += 1;
    if (record.factorIsCustom === true) counts.customFactorCount += 1;
    if (Number(record.amountTonnes || record.emissionsTCo2e || record.emissionsKgCo2e || 0) === 0) counts.zeroAmountCount += 1;
    if (record.calculationStatus === "calculation_error") counts.calculationErrorCount += 1;
    if (record.supplierId) counts.supplierLinkedCount += 1;
    if (!record.supplierId) counts.unlinkedSupplierCount += 1;
  });

  return counts;
}

class ReportsService extends BaseService {
  static async list(query = {}, companyId) {
    const filter = { companyId, ...this.getLikeFilter(["name", "reportName", "type", "reportType", "format", "outputFormat"], query.search) };
    const result = await this.buildListResult(Report, { query, filter, sort: { generatedAt: -1, createdAt: -1 } });
    return {
      ...result,
      data: result.data.map(serializeReport),
    };
  }

  static async readiness(payload = {}, companyId, actor = null, details = {}) {
    const { start, end } = normalizePeriod(payload);
    const periodFilter = { companyId };
    if (start || end) {
      periodFilter.occurredAt = {};
      if (start) periodFilter.occurredAt.$gte = start;
      if (end) periodFilter.occurredAt.$lte = end;
    }

    const records = await EmissionRecord.find(periodFilter).lean();
    const counts = buildReadinessSummary(records);
    const unapprovedRecordCount = records.length - counts.approvedRecordsCount;
    const dates = records
      .map((record) => new Date(record.occurredAt || record.createdAt || 0))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((left, right) => left - right);
    const reportingPeriodCoverage = {
      requestedStart: start,
      requestedEnd: end,
      earliestRecordDate: dates[0] || null,
      latestRecordDate: dates[dates.length - 1] || null,
      recordCount: records.length,
    };
    const blockers = [];
    const warnings = [];
    const recommendations = [];

    if (counts.approvedRecordsCount === 0) {
      blockers.push("No approved emission records are available for an approved-record report.");
      recommendations.push("Approve carbon ledger records before generating a board-ready ESG report.");
    }
    if (counts.missingFactorCount > 0) {
      warnings.push(`${counts.missingFactorCount} records have missing emission factors.`);
      recommendations.push("Review missing factors in Carbon Ledger before formal reporting.");
    }
    if (counts.sampleFactorCount > 0) {
      warnings.push(`${counts.sampleFactorCount} records use sample emission factors.`);
      recommendations.push("Replace sample factors with official or company-approved factors before external reporting.");
    }
    if (unapprovedRecordCount > 0) {
      warnings.push(`${unapprovedRecordCount} unapproved records exist in the selected period.`);
    }
    if (counts.zeroAmountCount > 0) warnings.push(`${counts.zeroAmountCount} records have zero emissions/activity amounts.`);
    if (counts.calculationErrorCount > 0) warnings.push(`${counts.calculationErrorCount} records have calculation errors.`);

    const response = {
      ...counts,
      reportingPeriodCoverage,
      canGenerateApprovedReport: counts.approvedRecordsCount > 0 && counts.missingFactorCount === 0 && counts.calculationErrorCount === 0,
      canGenerateInternalReport: records.length > 0,
      blockers,
      warnings,
      recommendations,
    };

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      userAgent: details.userAgent || null,
      action: "report_readiness_checked",
      entityType: "report",
      entityId: companyId,
      details: response,
    });

    return response;
  }

  static async generate(payload, companyId, actor = null) {
    const reportName = String(payload.reportName || payload.name || "").trim();
    if (!reportName) {
      throw new ApiError(422, "Report name is required.");
    }

    const reportType = normalizeReportType(payload.reportType || payload.type);
    const outputFormat = normalizeFormat(payload.outputFormat || payload.format, reportType);
    const inclusionPolicy = normalizeInclusionPolicy(payload);
    const { start, end } = normalizePeriod(payload);
    const dataSections = Array.isArray(payload.dataSections) ? payload.dataSections.map(String) : [];

    const readiness = await this.readiness({
      reportingPeriodStart: start,
      reportingPeriodEnd: end,
    }, companyId, actor, {
      ipAddress: actor?.ipAddress || null,
      userAgent: actor?.userAgent || null,
    });

    if (inclusionPolicy === "approved_only" && readiness.approvedRecordsCount === 0 && ["esg_pdf", "carbon_ledger", "supplier_esg"].includes(reportType)) {
      throw new ApiError(409, "Not enough approved records to generate an approved-record report. Choose internal all-records with warning or approve records first.");
    }

    const metadata = {
      ...(payload.metadata || {}),
      reportType,
      outputFormat,
      inclusionPolicy,
      approvedOnly: inclusionPolicy === "approved_only",
      includeUnapproved: inclusionPolicy === "all_records_with_warning",
      reportingPeriodStart: start ? start.toISOString() : null,
      reportingPeriodEnd: end ? end.toISOString() : null,
      dataSections,
      readiness,
      warnings: [
        ...(readiness.warnings || []),
        ...(inclusionPolicy === "all_records_with_warning" ? ["This report includes unapproved records and is intended for internal review."] : []),
      ],
      methodology: {
        version: "carbonflow-methodology-v1",
        formula: "emissions = activity data x emission factor",
        assurance: "Internal/unaudited. No external assurance statement is provided.",
      },
    };

    let report = await Report.create({
      companyId,
      name: reportName,
      reportName,
      type: normalizeLegacyType(reportType),
      reportType,
      format: outputFormat,
      outputFormat,
      reportingPeriodStart: start,
      reportingPeriodEnd: end,
      inclusionPolicy,
      status: "generating",
      generatedBy: actor?.id || null,
      generatedAt: new Date(),
      downloadUrl: "/api/reports/pending/download",
      recordCounts: {
        approved: readiness.approvedRecordsCount,
        draft: readiness.draftRecordsCount,
        submitted: readiness.submittedRecordsCount,
        rejected: readiness.rejectedRecordsCount,
        needsCorrection: readiness.needsCorrectionRecordsCount,
      },
      dataQualitySummary: readiness,
      sampleFactorCount: readiness.sampleFactorCount,
      missingFactorCount: readiness.missingFactorCount,
      unapprovedRecordCount: readiness.reportingPeriodCoverage.recordCount - readiness.approvedRecordsCount,
      staleFactorCount: readiness.staleFactorCount,
      methodologyVersion: "carbonflow-methodology-v1",
      reportVersion: "1.0",
      metadata,
    });

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: actor?.ipAddress || null,
      userAgent: actor?.userAgent || null,
      action: reportType === "custom_extract" ? "report_custom_export_generated" : "report_generation_started",
      entityType: "report",
      entityId: report.id,
      details: { reportType, outputFormat, inclusionPolicy },
    });

    try {
      const dataset = await this.buildDataset(companyId, metadata);
      const scopeTotals = {
        scope1: dataset.dashboard.summary.scope1,
        scope2: dataset.dashboard.summary.scope2,
        scope3: dataset.dashboard.summary.scope3,
        total: dataset.dashboard.summary.totalEmissions,
      };
      report.status = "completed";
      report.completedAt = new Date();
      report.downloadUrl = `/api/reports/${report.id}/download`;
      report.scopeTotals = scopeTotals;
      report.recordCounts = {
        ...report.recordCounts,
        total: dataset.emissionRecords.length,
        approved: dataset.dataQualityNotes.statusSummary.approved || 0,
        unapproved: dataset.dataQualityNotes.unapprovedRecords || 0,
      };
      report.dataQualitySummary = {
        ...readiness,
        ...dataset.dataQualityNotes,
      };
      report.sampleFactorCount = dataset.dataQualityNotes.sampleFactorRecords;
      report.missingFactorCount = dataset.dataQualityNotes.missingFactorRecords;
      report.unapprovedRecordCount = dataset.dataQualityNotes.unapprovedRecords;
      report.staleFactorCount = dataset.dataQualityNotes.staleFactorRecords;
      await report.save();

      await AuditService.log({
        companyId,
        userId: actor?.id || null,
        userEmail: actor?.email || null,
        ipAddress: actor?.ipAddress || null,
        userAgent: actor?.userAgent || null,
        action: "report_generation_completed",
        entityType: "report",
        entityId: report.id,
        details: { reportType, outputFormat, inclusionPolicy, scopeTotals },
      });

      return serializeReport(report);
    } catch (error) {
      report.status = "failed";
      report.failedAt = new Date();
      report.failureReason = error.message;
      await report.save();
      await AuditService.log({
        companyId,
        userId: actor?.id || null,
        userEmail: actor?.email || null,
        ipAddress: actor?.ipAddress || null,
        userAgent: actor?.userAgent || null,
        action: "report_generation_failed",
        entityType: "report",
        entityId: report.id,
        details: { reportType, outputFormat, inclusionPolicy, failureReason: error.message },
      });
      throw error;
    }
  }

  static async getReportOrFail(id, companyId) {
    const report = await Report.findOne({ _id: id, companyId });
    if (!report) {
      throw new ApiError(404, "Report not found.");
    }
    return report;
  }

  static async getByFileName(fileName, companyId) {
    const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const report = await Report.findOne({
      companyId,
      downloadUrl: { $regex: `${escaped}$`, $options: "i" },
    });
    if (!report) {
      throw new ApiError(404, "Report not found.");
    }
    return report;
  }

  static buildDashboardForReport(dashboard, records) {
    const scopeSummary = records.reduce((accumulator, record) => {
      const amount = getRecordTonnes(record);
      accumulator.totalEmissions += amount;
      if (Number(record.scope) === 1) accumulator.scope1 += amount;
      if (Number(record.scope) === 2) accumulator.scope2 += amount;
      if (Number(record.scope) === 3) accumulator.scope3 += amount;
      return accumulator;
    }, { totalEmissions: 0, scope1: 0, scope2: 0, scope3: 0 });
    const categoryMap = new Map();
    const monthlyMap = new Map();

    records.forEach((record) => {
      const name = record.category || "Uncategorized";
      const bucket = categoryMap.get(name) || { name, value: 0, scope1: 0, scope2: 0, scope3: 0 };
      const amount = getRecordTonnes(record);
      bucket.value = round(bucket.value + amount);
      if (Number(record.scope) === 1) bucket.scope1 = round(bucket.scope1 + amount);
      if (Number(record.scope) === 2) bucket.scope2 = round(bucket.scope2 + amount);
      if (Number(record.scope) === 3) bucket.scope3 = round(bucket.scope3 + amount);
      categoryMap.set(name, bucket);

      const occurredAt = new Date(record.occurredAt || Date.now());
      const year = record.periodYear || occurredAt.getUTCFullYear();
      const month = record.periodMonth || occurredAt.getUTCMonth() + 1;
      const key = `${year}-${String(month).padStart(2, "0")}`;
      const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
      const monthlyBucket = monthlyMap.get(key) || { name: monthName, scope1: 0, scope2: 0, scope3: 0, emissions: 0, cost: 0 };
      monthlyBucket.emissions = round(monthlyBucket.emissions + amount);
      if (Number(record.scope) === 1) monthlyBucket.scope1 = round(monthlyBucket.scope1 + amount);
      if (Number(record.scope) === 2) monthlyBucket.scope2 = round(monthlyBucket.scope2 + amount);
      if (Number(record.scope) === 3) monthlyBucket.scope3 = round(monthlyBucket.scope3 + amount);
      monthlyBucket.cost = round(monthlyBucket.cost + Number(record.costUsd || 0));
      monthlyMap.set(key, monthlyBucket);
    });

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
      categories: Array.from(categoryMap.values()).sort((left, right) => right.value - left.value).slice(0, 12),
      monthly: Array.from(monthlyMap.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value),
    };
  }

  static async buildDataset(companyId, metadata = {}) {
    const recordFilter = buildRecordFilter(companyId, metadata);
    const [dashboard, shipments, suppliers, settings, offsetTransactions, emissionRecords, reportsThisPeriod] = await Promise.all([
      DashboardService.getMetrics(companyId),
      Shipment.find({ companyId }).sort({ createdAt: -1 }).limit(50).lean(),
      Supplier.find({ companyId }).sort({ createdAt: -1 }).limit(50).lean(),
      Setting.findOne({ companyId }).lean(),
      Transaction.find({ companyId, status: "COMPLETED" }).sort({ retiredAt: -1 }).limit(50).lean(),
      EmissionRecord.find(recordFilter).sort({ occurredAt: -1 }).limit(5000).lean(),
      Report.countDocuments({ companyId, generatedAt: { $gte: metadata.reportingPeriodStart ? new Date(metadata.reportingPeriodStart) : new Date(new Date().getUTCFullYear(), 0, 1) } }),
    ]);
    const supplierMap = new Map(suppliers.map((supplier) => [String(supplier._id || supplier.id), supplier]));
    const totalEmissions = emissionRecords.reduce((sum, record) => sum + getRecordTonnes(record), 0);
    const supplierBreakdownMap = new Map();

    emissionRecords.forEach((record) => {
      const amount = getRecordTonnes(record);
      if (!record.supplierId && !record.activityData?.supplierName && !record.supplierName) return;
      const linked = Boolean(record.supplierId);
      const key = linked ? String(record.supplierId) : `metadata:${record.activityData?.supplierName || record.supplierName}`;
      const supplier = linked ? supplierMap.get(key) : null;
      const bucket = supplierBreakdownMap.get(key) || {
        supplierId: linked ? key : null,
        name: supplier?.name || record.activityData?.supplierName || record.supplierName || "Unverified supplier link",
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

    const governance = await Promise.all(emissionRecords.map((record) => EmissionRecordService.buildFactorGovernance(record, companyId)));
    const statusSummary = emissionRecords.reduce((accumulator, record) => {
      const status = record.dataStatus || "draft";
      accumulator[status] = (accumulator[status] || 0) + 1;
      return accumulator;
    }, {});
    const dataQualityNotes = {
      sampleFactorRecords: emissionRecords.filter((record) => record.factorIsSample === true).length,
      missingFactorRecords: emissionRecords.filter((record) => record.calculationStatus === "missing_factor" || record.factorValue === null || record.factorValue === undefined).length,
      staleFactorRecords: governance.filter((item) => item.isStaleFactor).length,
      unapprovedRecords: emissionRecords.filter((record) => record.dataStatus !== "approved").length,
      zeroAmountRecords: emissionRecords.filter((record) => Number(record.amountTonnes || record.emissionsTCo2e || record.emissionsKgCo2e || 0) === 0).length,
      calculationErrorRecords: emissionRecords.filter((record) => record.calculationStatus === "calculation_error").length,
      statusSummary,
      reportsGeneratedThisPeriod: reportsThisPeriod,
    };

    return {
      dashboard: this.buildDashboardForReport(dashboard, emissionRecords),
      shipments,
      suppliers,
      settings,
      offsetTransactions,
      emissionRecords,
      supplierBreakdown: Array.from(supplierBreakdownMap.values())
        .map((item) => ({ ...item, sharePct: totalEmissions ? round((item.value / totalEmissions) * 100, 2) : 0 }))
        .sort((left, right) => right.value - left.value),
      dataQualityNotes,
      recordSelection: metadata.inclusionPolicy === "all_records_with_warning" || metadata.includeUnapproved ? "all_records_with_warning" : "approved_only",
    };
  }

  static buildScopeCsv(report, dataset) {
    const headers = [
      "recordId", "scope", "category", "activityType", "activityAmount", "activityUnit", "factorKey", "factorValueUsed", "factorUnitUsed", "factorSourceName", "factorSourceYear", "factorVersion", "factorStatus", "factorIsSample", "factorIsOfficial", "factorIsCustom", "formula", "kgCO2e", "tCO2e", "reportingPeriodStart", "reportingPeriodEnd", "activityDate", "facility", "businessUnit", "supplier", "shipment", "status", "calculationStatus", "createdAt", "approvedAt",
    ];
    return [
      csvRow(headers),
      ...dataset.emissionRecords.map((record) => csvRow([
        record._id || record.id,
        record.scope,
        record.category,
        record.sourceType || record.activityData?.activityType || "",
        record.activityAmount ?? record.activityData?.activityAmount ?? "",
        record.activityUnit || "",
        record.emissionFactorId || record.factorKey || "",
        record.factorValueUsed ?? record.factorValue ?? "",
        record.factorUnitUsed || record.factorUnit || "",
        record.factorSourceName || record.factorSource || "",
        record.factorSourceYear || "",
        record.factorVersion || "",
        record.factorIsSample === true ? "sample" : record.factorIsOfficial === true ? "official" : record.factorIsCustom === true ? "custom" : "configured",
        record.factorIsSample === true,
        record.factorIsOfficial === true,
        record.factorIsCustom === true,
        record.formula || record.activityData?.calculationFormula || "emissions = activity data x emission factor",
        record.emissionsKgCo2e ?? Number(record.amountTonnes || 0) * 1000,
        record.emissionsTCo2e ?? record.amountTonnes,
        report.reportingPeriodStart ? new Date(report.reportingPeriodStart).toISOString() : "",
        report.reportingPeriodEnd ? new Date(report.reportingPeriodEnd).toISOString() : "",
        record.occurredAt ? new Date(record.occurredAt).toISOString() : "",
        record.facilityName || "",
        record.businessUnit || "",
        record.supplierName || record.activityData?.supplierName || record.supplierId || "",
        record.shipmentReference || record.shipmentId || "",
        record.dataStatus || "draft",
        record.calculationStatus || "",
        record.createdAt ? new Date(record.createdAt).toISOString() : "",
        record.approvedAt ? new Date(record.approvedAt).toISOString() : "",
      ])),
    ].join("\n");
  }

  static buildCsv(report, dataset) {
    const reportType = report.reportType || REPORT_TYPES[report.type] || "custom_extract";
    if (reportType === "scope_export_csv") {
      return this.buildScopeCsv(report, dataset);
    }

    const quality = dataset.dataQualityNotes;
    const rows = [
      ["Report ID", report.id || report._id],
      ["Report Name", report.reportName || report.name],
      ["Report Type", reportType],
      ["Format", report.outputFormat || report.format],
      ["Generated At", new Date(report.generatedAt).toISOString()],
      ["Company", dataset.settings?.companyName || "CarbonFlow"],
      ["Reporting Period Start", report.reportingPeriodStart ? new Date(report.reportingPeriodStart).toISOString() : "All available records"],
      ["Reporting Period End", report.reportingPeriodEnd ? new Date(report.reportingPeriodEnd).toISOString() : "All available records"],
      ["Inclusion Policy", dataset.recordSelection === "approved_only" ? "Approved records only" : "All records with warning"],
      ...(dataset.recordSelection === "approved_only" ? [] : [["Warning", "This report includes unapproved records and is intended for internal review."]]),
      ...(quality.sampleFactorRecords ? [["Sample Factor Warning", `${quality.sampleFactorRecords} records use sample factors. Do not present sample factors as official.`]] : []),
      ...(quality.missingFactorRecords ? [["Missing Factor Warning", `${quality.missingFactorRecords} records are missing factor data.`]] : []),
      ...(quality.staleFactorRecords ? [["Stale Factor Warning", `${quality.staleFactorRecords} records use inactive or outdated factor snapshots.`]] : []),
      [],
      ["Executive Summary"],
      ["Total Emissions (tCO2e)", dataset.dashboard.summary.totalEmissions],
      ["Scope 1 (tCO2e)", dataset.dashboard.summary.scope1],
      ["Scope 2 (tCO2e)", dataset.dashboard.summary.scope2],
      ["Scope 3 (tCO2e)", dataset.dashboard.summary.scope3],
      ["Reports Generated This Period", quality.reportsGeneratedThisPeriod],
      [],
      ["Category Breakdown"],
      ["Category", "Scope 1", "Scope 2", "Scope 3", "Total tCO2e"],
      ...dataset.dashboard.categories.map((item) => [item.name, item.scope1, item.scope2, item.scope3, item.value]),
      [],
      ["Monthly Breakdown"],
      ["Month", "Scope 1", "Scope 2", "Scope 3", "Emissions", "Cost"],
      ...dataset.dashboard.monthly.map((month) => [month.name, month.scope1, month.scope2, month.scope3, month.emissions, month.cost]),
      [],
      ["Supplier Breakdown"],
      ["Supplier", "Link Status", "Category", "Country", "Risk Level", "Record Count", "Total tCO2e", "Share %"],
      ...dataset.supplierBreakdown.map((supplier) => [supplier.name, supplier.linkStatus, supplier.category || "", supplier.country || "", supplier.riskLevel || "", supplier.recordCount, supplier.value, supplier.sharePct]),
      [],
      ["Record Status Summary"],
      ["Approved/Draft Status Summary"],
      ["Status", "Record Count"],
      ...Object.entries(quality.statusSummary).map(([status, count]) => [status, count]),
      [],
      ["Methodology"],
      ["Methodology Version", report.methodologyVersion || "carbonflow-methodology-v1"],
      ["Formula", "emissions = activity data x emission factor"],
      ...(quality.sampleFactorRecords ? [["Sample Factor Disclaimer", "Sample emission factors are fallback placeholders and must be replaced with official/custom factors before official reporting."]] : []),
      ["Assurance", "Internal/unaudited. No external assurance statement is provided."],
      ["Limitations", "This report does not claim GHG Protocol, ISO, or CSRD compliance unless reviewed against required boundaries, methodology, data quality, and limitations."],
      [],
      ["Emission Activity Calculation Detail"],
      ["Record ID", "Status", "Scope", "Category", "Factor Source", "Factor Year", "Factor Status", "Formula", "kgCO2e", "tCO2e"],
      ...dataset.emissionRecords.slice(0, 500).map((record) => [
        record._id || record.id || "",
        record.dataStatus || "draft",
        record.scope,
        record.category,
        record.factorSourceName || record.factorSource || "",
        record.factorSourceYear || "",
        record.factorIsSample === true ? "sample" : record.factorIsOfficial === true ? "official" : record.factorIsCustom === true ? "custom" : "configured",
        record.formula || record.activityData?.calculationFormula || "emissions = activity data x emission factor",
        record.emissionsKgCo2e ?? Number(record.amountTonnes || 0) * 1000,
        record.emissionsTCo2e ?? record.amountTonnes,
      ]),
    ];
    return rows.map(csvRow).join("\n");
  }

  static buildPdf(report, dataset) {
    const quality = dataset.dataQualityNotes;
    return new Promise((resolve) => {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      doc.fontSize(24).text(report.reportName || report.name, { align: "center" });
      doc.moveDown();
      doc.fontSize(12).text(`Company: ${dataset.settings?.companyName || "CarbonFlow"}`, { align: "center" });
      doc.text(`Report Type: ${report.reportType || report.type}`, { align: "center" });
      doc.text(`Reporting Period: ${report.reportingPeriodStart ? new Date(report.reportingPeriodStart).toISOString().slice(0, 10) : "Start"} to ${report.reportingPeriodEnd ? new Date(report.reportingPeriodEnd).toISOString().slice(0, 10) : "Latest"}`, { align: "center" });
      doc.text(`Generated At: ${new Date(report.generatedAt).toISOString()}`, { align: "center" });
      doc.text(`Inclusion Policy: ${report.inclusionPolicy || "approved_only"}`, { align: "center" });
      doc.moveDown(2);
      doc.fontSize(11).fillColor("#92400e").text("Internal/unaudited report. No external assurance statement is provided.", { align: "center" });
      doc.fillColor("#111827").addPage();

      doc.fontSize(16).text("Executive Summary");
      doc.fontSize(10);
      doc.text(`Total emissions: ${dataset.dashboard.summary.totalEmissions} tCO2e`);
      doc.text(`Scope 1: ${dataset.dashboard.summary.scope1} tCO2e`);
      doc.text(`Scope 2: ${dataset.dashboard.summary.scope2} tCO2e`);
      doc.text(`Scope 3: ${dataset.dashboard.summary.scope3} tCO2e`);
      doc.text(`Financial exposure: $${dataset.dashboard.summary.totalCost || 0}`);
      doc.text(`Activities included: ${dataset.emissionRecords.length}`);
      doc.moveDown();

      if (dataset.recordSelection !== "approved_only") {
        doc.fillColor("#92400e").text("Warning: this report includes unapproved records and is intended for internal review.");
        doc.fillColor("#111827");
      }
      if (quality.sampleFactorRecords) doc.text(`Sample factor warning: ${quality.sampleFactorRecords} records use sample factors.`);
      if (quality.missingFactorRecords) doc.text(`Missing factor warning: ${quality.missingFactorRecords} records are missing factor data.`);
      if (quality.staleFactorRecords) doc.text(`Stale factor warning: ${quality.staleFactorRecords} records use stale factors.`);
      doc.moveDown();

      doc.fontSize(14).text("Scope Breakdown");
      doc.fontSize(10);
      dataset.dashboard.scopeBreakdown.forEach((item) => doc.text(`${item.name}: ${item.value} tCO2e (${item.percentage}%)`));
      doc.moveDown();
      doc.fontSize(14).text("Category Breakdown");
      doc.fontSize(10);
      dataset.dashboard.categories.forEach((item) => doc.text(`${item.name}: ${item.value} tCO2e | S1 ${item.scope1} | S2 ${item.scope2} | S3 ${item.scope3}`));
      doc.moveDown();
      doc.fontSize(14).text("Monthly Trend");
      doc.fontSize(10);
      dataset.dashboard.monthly.forEach((month) => doc.text(`${month.name}: ${month.emissions} tCO2e | S1 ${month.scope1} | S2 ${month.scope2} | S3 ${month.scope3}`));
      doc.moveDown();
      doc.fontSize(14).text("Supplier Breakdown");
      doc.fontSize(10);
      if (!dataset.supplierBreakdown.length) doc.text("No supplier-linked records in this report.");
      dataset.supplierBreakdown.slice(0, 20).forEach((supplier) => doc.text(`${supplier.name} | ${supplier.linkStatus} | ${supplier.value} tCO2e | ${supplier.recordCount} records | ${supplier.sharePct}%`));
      doc.moveDown();
      doc.fontSize(14).text("Shipment Breakdown");
      doc.fontSize(10);
      if (!dataset.shipments.length) doc.text("No shipments found for this company.");
      dataset.shipments.slice(0, 20).forEach((shipment) => doc.text(`${shipment.reference} | ${shipment.origin} -> ${shipment.destination} | ${shipment.transportMode} | ${shipment.emissionsTonnes || 0} tCO2e`));
      doc.moveDown();
      doc.fontSize(14).text("Marketplace Retirements");
      doc.fontSize(10);
      if (!dataset.offsetTransactions.length) doc.text("No completed marketplace retirement transactions found.");
      dataset.offsetTransactions.slice(0, 20).forEach((transaction) => doc.text(`${transaction.projectName || transaction.metadata?.projectName || transaction.projectId || "Project"} | ${transaction.credits || transaction.quantity || 0} tCO2e | ${transaction.registryRetirementStatus || "pending"}`));
      doc.moveDown();
      doc.fontSize(14).text("Data Quality And Record Status");
      doc.fontSize(10);
      Object.entries(quality.statusSummary).forEach(([status, count]) => doc.text(`${status}: ${count}`));
      doc.text(`Missing factors: ${quality.missingFactorRecords}`);
      doc.text(`Sample factors: ${quality.sampleFactorRecords}`);
      doc.text(`Official factors: ${dataset.emissionRecords.filter((record) => record.factorIsOfficial === true).length}`);
      doc.text(`Custom factors: ${dataset.emissionRecords.filter((record) => record.factorIsCustom === true).length}`);
      doc.text(`Stale factors: ${quality.staleFactorRecords}`);
      doc.text(`Zero amount records: ${quality.zeroAmountRecords}`);
      doc.text(`Calculation errors: ${quality.calculationErrorRecords}`);
      doc.moveDown();
      doc.fontSize(14).text("Methodology, Limitations, And Audit Metadata");
      doc.fontSize(10);
      doc.text("Methodology version: carbonflow-methodology-v1");
      doc.text("Formula: emissions = activity data x emission factor. Results are normalized to kgCO2e and tCO2e.");
      doc.text("Emission factor sources are taken from each emission record snapshot. Sample factors are not official and must not be presented as official.");
      doc.text("This report does not claim GHG Protocol, ISO, or CSRD compliance unless reviewed against required boundaries, methodology, data quality, and limitations.");
      doc.text(`Report ID: ${report.id || report._id}`);
      doc.text(`Report version: ${report.reportVersion || "1.0"}`);
      doc.end();
    });
  }

  static async buildDownloadById(id, companyId, actor = null, details = {}) {
    const report = await this.getReportOrFail(id, companyId);
    if (["failed", "FAILED", "archived"].includes(report.status)) {
      throw new ApiError(409, "Report is not available for download.");
    }
    const dataset = await this.buildDataset(companyId, report.metadata || {});
    const serialized = serializeReport(report);
    const extension = serialized.format.toLowerCase();
    const fileName = `${serialized.name.replace(/[^a-z0-9-]+/gi, "_")}-${serialized.id}.${extension}`;

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      userAgent: details.userAgent || null,
      action: "report_downloaded",
      entityType: "report",
      entityId: report.id,
      details: { reportType: serialized.reportType, format: serialized.format, inclusionPolicy: serialized.inclusionPolicy },
    });

    if (serialized.format === "CSV") {
      return {
        fileName,
        contentType: "text/csv; charset=utf-8",
        content: this.buildCsv(report, dataset),
      };
    }

    if (serialized.format === "JSON") {
      return {
        fileName,
        contentType: "application/json; charset=utf-8",
        content: JSON.stringify({ report: serialized, dataset }, null, 2),
      };
    }

    return {
      fileName,
      contentType: "application/pdf",
      content: await this.buildPdf(report, dataset),
    };
  }

  static async buildDownload(fileName, companyId, actor = null, details = {}) {
    const report = await this.getByFileName(fileName, companyId);
    return this.buildDownloadById(report.id, companyId, actor, details);
  }

  static async archive(id, companyId, actor = null, details = {}) {
    const report = await this.getReportOrFail(id, companyId);
    const previousStatus = report.status;
    report.status = "archived";
    await report.save();
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      userAgent: details.userAgent || null,
      action: "report_archived",
      entityType: "report",
      entityId: report.id,
      oldValue: { status: previousStatus },
      newValue: { status: "archived" },
    });
    return serializeReport(report);
  }

  static async regenerate(id, companyId, actor = null) {
    const report = await this.getReportOrFail(id, companyId);
    const regenerated = await this.generate({
      reportName: `${report.reportName || report.name} Regenerated`,
      reportType: report.reportType || report.type,
      outputFormat: report.outputFormat || report.format,
      inclusionPolicy: report.inclusionPolicy,
      reportingPeriodStart: report.reportingPeriodStart,
      reportingPeriodEnd: report.reportingPeriodEnd,
      dataSections: report.metadata?.dataSections || [],
      metadata: {
        ...(report.metadata || {}),
        regeneratedFromReportId: report.id,
      },
    }, companyId, actor);
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: actor?.ipAddress || null,
      userAgent: actor?.userAgent || null,
      action: "report_regenerated",
      entityType: "report",
      entityId: regenerated.id,
      details: { regeneratedFromReportId: report.id },
    });
    return regenerated;
  }

  static async getAuditSummary(reportId, companyId) {
    return AuditLog.find({ companyId, entityType: "report", entityId: String(reportId) }).sort({ createdAt: -1 }).limit(20).lean();
  }
}

module.exports = ReportsService;
