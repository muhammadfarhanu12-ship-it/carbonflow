const { Shipment, Supplier, LedgerEntry, CarbonProject, Transaction, Setting, EmissionRecord, Report } = require("../models");
const { round } = require("./carbonEngine");
const cache = require("../utils/cache");
const { buildSupplierIntelligenceSummary } = require("./supplierBenchmarking.service");

function buildMonthWindow(count = 6) {
  const months = [];
  const cursor = new Date();
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);

  for (let index = count - 1; index >= 0; index -= 1) {
    const nextDate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - index, 1));
    months.push({
      year: nextDate.getUTCFullYear(),
      month: nextDate.getUTCMonth() + 1,
      name: nextDate.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
      scope1: 0,
      scope2: 0,
      scope3: 0,
      emissions: 0,
      cost: 0,
    });
  }

  return months;
}

function getMonthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function coerceDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function resolveInclusionPolicy(query = {}) {
  const requested = query.inclusionPolicy || query.records || query.view;
  return ["approved_only", "all_records", "draft_included"].includes(requested) ? requested : "approved_only";
}

function recordEmissions(record) {
  const value = Number(record.amountTonnes ?? record.emissionsTCo2e ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function recordActivityAmount(record) {
  const value = Number(record.activityAmount ?? record.activityData?.activityAmount ?? record.activityData?.amount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function recordHasMissingFactor(record) {
  return record.factorValue === null || record.factorValue === undefined || record.factorValue === "" || Number(record.factorValue) <= 0;
}

function recordHasCalculationError(record) {
  const activityAmount = recordActivityAmount(record);
  const emissions = recordEmissions(record);
  return activityAmount > 0 && !recordHasMissingFactor(record) && emissions <= 0;
}

function selectIncludedRecords(records, inclusionPolicy) {
  if (inclusionPolicy === "approved_only") {
    return records.filter((record) => record.dataStatus === "approved");
  }

  if (inclusionPolicy === "draft_included") {
    return records.filter((record) => record.dataStatus !== "rejected");
  }

  return records;
}

function buildDataQualityIssues(counts, inclusionPolicy) {
  const issues = [];
  const addIssue = (type, count, message, severity = "warning") => {
    if (count > 0) {
      issues.push({ type, count, message, severity });
    }
  };

  addIssue("draft_records", counts.draftRecords, `${counts.draftRecords} draft records are not included in approved emissions.`, "warning");
  addIssue("submitted_records", counts.submittedRecords, `${counts.submittedRecords} submitted records are waiting for approval.`, "info");
  addIssue("missing_factors", counts.missingFactorRecords, `${counts.missingFactorRecords} records are missing an emission factor.`, "critical");
  addIssue("sample_factors", counts.sampleFactorRecords, `${counts.sampleFactorRecords} records use sample factors and should be replaced before production reporting.`, "warning");
  addIssue("zero_activity", counts.zeroAmountRecords, `${counts.zeroAmountRecords} records have zero activity amount.`, "warning");
  addIssue("calculation_errors", counts.calculationErrorRecords, `${counts.calculationErrorRecords} records could not be calculated from available activity and factor data.`, "critical");

  if (inclusionPolicy === "approved_only") {
    addIssue("excluded_records", counts.excludedRecordsCount, `${counts.excludedRecordsCount} records are excluded by the approved-only dashboard filter.`, "info");
  }

  return issues;
}

function buildScopeSummary(records) {
  return records.reduce((accumulator, record) => {
    const amountTonnes = recordEmissions(record);
    accumulator.totalEmissions += amountTonnes;

    if (record.scope === 1) accumulator.scope1 += amountTonnes;
    if (record.scope === 2) accumulator.scope2 += amountTonnes;
    if (record.scope === 3) accumulator.scope3 += amountTonnes;

    return accumulator;
  }, {
    totalEmissions: 0,
    scope1: 0,
    scope2: 0,
    scope3: 0,
  });
}

function buildDashboardPayload({
  records = [],
  shipments = [],
  suppliers = [],
  ledgerEntries = [],
  projects = [],
  transactions = [],
  settings = null,
  reports = [],
  inclusionPolicy = "approved_only",
}) {
  const includedRecords = selectIncludedRecords(records, inclusionPolicy);
  const scopeSummary = buildScopeSummary(includedRecords);
  const totalShipmentCost = shipments.reduce((sum, shipment) => sum + Number(shipment.costUsd || 0), 0);
  const totalLedgerSpend = ledgerEntries.reduce((sum, entry) => sum + Number(entry.totalCostUsd || entry.logisticsCostUsd || 0), 0);
  const totalLogisticsCost = round(totalLedgerSpend || totalShipmentCost);
  const totalOffsets = round(transactions.reduce((sum, transaction) => sum + Number(transaction.credits || 0), 0));
  const highRiskSuppliers = suppliers.filter((supplier) => Number(supplier.riskScore || 0) >= 70 || supplier.riskLevel === "HIGH").length;
  const averageSupplierScore = suppliers.length
    ? round(suppliers.reduce((sum, supplier) => sum + Number(supplier.carbonScore || 0), 0) / suppliers.length, 2)
    : 0;
  const supplierIntelligence = buildSupplierIntelligenceSummary(suppliers);
  const operationalMetrics = settings?.operationalMetrics || {};
  const revenueUsd = Number(operationalMetrics.revenueUsd || 0);
  const shipmentCount = shipments.length;
  let carbonIntensity = null;
  let carbonIntensityUnit = "Not available";
  let carbonIntensityBasis = null;

  if (revenueUsd > 0) {
    carbonIntensity = round((scopeSummary.totalEmissions * 1000) / revenueUsd, 4);
    carbonIntensityUnit = "kgCO2e/USD revenue";
    carbonIntensityBasis = "revenue";
  } else if (totalLogisticsCost > 0) {
    carbonIntensity = round((scopeSummary.totalEmissions * 1000) / totalLogisticsCost, 4);
    carbonIntensityUnit = "kgCO2e/$ spend";
    carbonIntensityBasis = "spend";
  } else if (shipmentCount > 0) {
    carbonIntensity = round((scopeSummary.totalEmissions * 1000) / shipmentCount, 4);
    carbonIntensityUnit = "kgCO2e/shipment";
    carbonIntensityBasis = "shipment";
  }

  const monthlyTemplate = buildMonthWindow(6);
  const monthlyMap = new Map(monthlyTemplate.map((item) => [getMonthKey(item.year, item.month), item]));

  includedRecords.forEach((record) => {
    const key = getMonthKey(record.periodYear, record.periodMonth);
    const bucket = monthlyMap.get(key);
    if (!bucket) return;

    const amountTonnes = recordEmissions(record);
    bucket.emissions = round(bucket.emissions + amountTonnes);
    if (record.scope === 1) bucket.scope1 = round(bucket.scope1 + amountTonnes);
    if (record.scope === 2) bucket.scope2 = round(bucket.scope2 + amountTonnes);
    if (record.scope === 3) bucket.scope3 = round(bucket.scope3 + amountTonnes);
  });

  shipments.forEach((shipment) => {
    const shipmentDate = coerceDate(shipment.shipmentDate || shipment.createdAt);
    const key = getMonthKey(shipmentDate.getUTCFullYear(), shipmentDate.getUTCMonth() + 1);
    const bucket = monthlyMap.get(key);
    if (bucket) {
      bucket.cost = round(bucket.cost + Number(shipment.costUsd || 0));
    }
  });

  const monthly = monthlyTemplate.map((item) => ({
    name: item.name,
    scope1: round(item.scope1),
    scope2: round(item.scope2),
    scope3: round(item.scope3),
    emissions: round(item.emissions),
    cost: round(item.cost),
  }));

  const categoryMap = new Map();
  const facilityMap = new Map();
  includedRecords.forEach((record) => {
    const amountTonnes = recordEmissions(record);
    const category = record.category || "Uncategorized";
    const categoryBucket = categoryMap.get(category) || { name: category, value: 0, scope1: 0, scope2: 0, scope3: 0 };
    categoryBucket.value = round(categoryBucket.value + amountTonnes);
    if (record.scope === 1) categoryBucket.scope1 = round(categoryBucket.scope1 + amountTonnes);
    if (record.scope === 2) categoryBucket.scope2 = round(categoryBucket.scope2 + amountTonnes);
    if (record.scope === 3) categoryBucket.scope3 = round(categoryBucket.scope3 + amountTonnes);
    categoryMap.set(category, categoryBucket);

    const facility = record.facilityName || record.businessUnit || record.activityData?.origin || "Enterprise total";
    const facilityBucket = facilityMap.get(facility) || { name: facility, value: 0 };
    facilityBucket.value = round(facilityBucket.value + amountTonnes);
    facilityMap.set(facility, facilityBucket);
  });

  const requiredDataSignals = [
    records.some((record) => record.scope === 1),
    records.some((record) => record.scope === 2),
    records.some((record) => record.scope === 3),
    Boolean(settings?.operationalMetrics),
    shipments.length > 0,
    suppliers.length > 0,
  ];
  const dataCompletenessPct = round((requiredDataSignals.filter(Boolean).length / requiredDataSignals.length) * 100, 2);
  const statusCounts = records.reduce((accumulator, record) => {
    const status = record.dataStatus || "draft";
    accumulator[status] = (accumulator[status] || 0) + 1;
    return accumulator;
  }, {
    draft: 0,
    submitted: 0,
    reviewed: 0,
    approved: 0,
    rejected: 0,
    needs_correction: 0,
  });
  const approvedRecords = statusCounts.approved;
  const unapprovedRecords = records.length - approvedRecords;
  const reportsGenerated = reports.length;
  const latestReport = reports[0] || null;
  const missingFactorRecords = records.filter(recordHasMissingFactor).length;
  const sampleFactorRecords = records.filter((record) => record.factorIsSample !== false).length;
  const zeroAmountRecords = records.filter((record) => recordActivityAmount(record) <= 0).length;
  const calculationErrorRecords = records.filter(recordHasCalculationError).length;
  const calculatedRecords = records.filter((record) => recordEmissions(record) > 0).length;
  const includedRecordsCount = includedRecords.length;
  const excludedRecordsCount = records.length - includedRecordsCount;
  const dataQualityScore = Math.max(0, round(100 - Math.min(100,
    (statusCounts.draft * 8)
    + (statusCounts.submitted * 4)
    + (missingFactorRecords * 15)
    + (sampleFactorRecords * 5)
    + (zeroAmountRecords * 10)
    + (calculationErrorRecords * 20),
  ), 2));
  const dataQualityIssues = buildDataQualityIssues({
    draftRecords: statusCounts.draft,
    submittedRecords: statusCounts.submitted,
    missingFactorRecords,
    sampleFactorRecords,
    zeroAmountRecords,
    calculationErrorRecords,
    excludedRecordsCount,
  }, inclusionPolicy);

  const transportModes = ["ROAD", "RAIL", "AIR", "OCEAN"].map((mode) => ({
    name: mode,
    value: round(
      shipments
        .filter((shipment) => shipment.transportMode === mode)
        .reduce((sum, shipment) => sum + Number(shipment.emissionsTonnes || 0), 0),
    ),
  }));
  const scopeBreakdown = [
    { name: "Scope 1", value: round(scopeSummary.scope1), percentage: scopeSummary.totalEmissions ? round((scopeSummary.scope1 / scopeSummary.totalEmissions) * 100, 2) : 0 },
    { name: "Scope 2", value: round(scopeSummary.scope2), percentage: scopeSummary.totalEmissions ? round((scopeSummary.scope2 / scopeSummary.totalEmissions) * 100, 2) : 0 },
    { name: "Scope 3", value: round(scopeSummary.scope3), percentage: scopeSummary.totalEmissions ? round((scopeSummary.scope3 / scopeSummary.totalEmissions) * 100, 2) : 0 },
  ];
  const categories = Array.from(categoryMap.values()).sort((left, right) => right.value - left.value).slice(0, 8);
  const facilities = Array.from(facilityMap.values()).sort((left, right) => right.value - left.value).slice(0, 8);
  const topLevelCounts = {
    totalRecords: records.length,
    calculatedRecords,
    draftRecords: statusCounts.draft,
    submittedRecords: statusCounts.submitted,
    approvedRecords,
    missingFactorRecords,
    sampleFactorRecords,
    zeroAmountRecords,
    calculationErrorRecords,
    includedRecordsCount,
    excludedRecordsCount,
    inclusionPolicy,
    dataQualityScore,
    dataQualityIssues,
  };

  return {
    ...topLevelCounts,
    summary: {
      totalEmissions: round(scopeSummary.totalEmissions),
      scope1: round(scopeSummary.scope1),
      scope2: round(scopeSummary.scope2),
      scope3: round(scopeSummary.scope3),
      carbonIntensity,
      carbonIntensityUnit,
      carbonIntensityBasis,
      totalCost: totalLogisticsCost,
      totalLogisticsCost,
      totalOffsets,
      offsetsRetired: totalOffsets,
      highRiskSuppliers,
      activeProjects: projects.filter((project) => ["PUBLISHED", "ACTIVE"].includes(String(project.status || "").toUpperCase())).length,
      averageSupplierScore,
      totalSpend: round(totalLedgerSpend),
      totalCarbonTax: round(ledgerEntries.reduce((sum, entry) => sum + Number(entry.carbonTaxUsd || 0), 0)),
      dataCompletenessPct,
      dataQualityScore,
      activitiesRecorded: records.length,
      totalRecords: records.length,
      calculatedRecords,
      draftRecords: statusCounts.draft,
      submittedRecords: statusCounts.submitted,
      reviewedRecords: statusCounts.reviewed,
      approvedRecords,
      rejectedRecords: statusCounts.rejected,
      needsCorrectionRecords: statusCounts.needs_correction,
      unapprovedRecords,
      missingFactorRecords,
      sampleFactorRecords,
      zeroAmountRecords,
      calculationErrorRecords,
      includedRecordsCount,
      excludedRecordsCount,
      inclusionPolicy,
      missingFactorCount: missingFactorRecords,
      sampleFactorUsageCount: sampleFactorRecords,
      reportsGenerated,
      reportStatus: latestReport?.status || "NOT_GENERATED",
      supplierIntelligence,
    },
    monthly,
    monthlyTrend: monthly,
    costVsEmissions: monthly.map((entry) => ({
      name: entry.name,
      cost: entry.cost,
      emissions: entry.emissions,
    })),
    transportModes,
    scopeBreakdown,
    scopeTotals: scopeBreakdown,
    categories,
    categoryTotals: categories,
    facilities,
    dataQuality: {
      completenessPct: dataCompletenessPct,
      requiredSignals: requiredDataSignals.length,
      completedSignals: requiredDataSignals.filter(Boolean).length,
      sampleFactorRecords,
      missingFactorRecords,
      zeroAmountRecords,
      calculationErrorRecords,
      calculatedRecords,
      approvedRecords,
      draftRecords: statusCounts.draft,
      submittedRecords: statusCounts.submitted,
      reviewedRecords: statusCounts.reviewed,
      rejectedRecords: statusCounts.rejected,
      needsCorrectionRecords: statusCounts.needs_correction,
      unapprovedRecords,
      includedRecordsCount,
      excludedRecordsCount,
      inclusionPolicy,
      score: dataQualityScore,
      issues: dataQualityIssues,
      status: dataCompletenessPct >= 80 && dataQualityScore >= 80 ? "READY" : dataCompletenessPct >= 50 ? "PARTIAL" : "NEEDS_DATA",
    },
    reportStatus: {
      generatedCount: reportsGenerated,
      latestStatus: latestReport?.status || "NOT_GENERATED",
      latestGeneratedAt: latestReport?.generatedAt || null,
    },
  };
}

class DashboardService {
  static async getMetrics(companyId, query = {}) {
    const inclusionPolicy = resolveInclusionPolicy(query);
    return cache.remember(`dashboard:${companyId}:summary:${inclusionPolicy}`, 60000, async () => {
      const [records, shipments, suppliers, ledgerEntries, projects, transactions, settings, reports] = await Promise.all([
        EmissionRecord.find({ companyId }).lean(),
        Shipment.find({ companyId }).lean(),
        Supplier.find({ companyId }).lean(),
        LedgerEntry.find({ companyId }).lean(),
        CarbonProject.find({ companyId }).lean(),
        Transaction.find({ companyId, status: "COMPLETED" }).lean(),
        Setting.findOne({ companyId }).lean(),
        Report.find({ companyId }).sort({ generatedAt: -1 }).limit(10).lean(),
      ]);

      return buildDashboardPayload({
        records,
        shipments,
        suppliers,
        ledgerEntries,
        projects,
        transactions,
        settings,
        reports,
        inclusionPolicy,
      });
    });
  }
}

DashboardService._private = {
  buildDashboardPayload,
  buildDataQualityIssues,
  resolveInclusionPolicy,
  selectIncludedRecords,
};

module.exports = DashboardService;
