import { apiClient } from "./apiClient";
import type { DashboardData, DashboardDataQualityIssue, DashboardInclusionPolicy } from "@/src/types/platform";
import { asArray, asNumber, isRecord } from "@/src/utils/apiResponse";

export const EMPTY_DASHBOARD_DATA: DashboardData = {
  summary: {
    totalEmissions: 0,
    scope1: 0,
    scope2: 0,
    scope3: 0,
    carbonIntensity: null,
    carbonIntensityUnit: "Not available",
    carbonIntensityBasis: null,
    totalCost: 0,
    totalLogisticsCost: 0,
    totalOffsets: 0,
    offsetsRetired: 0,
    highRiskSuppliers: 0,
    activeProjects: 0,
    averageSupplierScore: 0,
    totalSpend: 0,
    totalCarbonTax: 0,
    dataCompletenessPct: 0,
    activitiesRecorded: 0,
    totalRecords: 0,
    calculatedRecords: 0,
    draftRecords: 0,
    submittedRecords: 0,
    reviewedRecords: 0,
    approvedRecords: 0,
    rejectedRecords: 0,
    needsCorrectionRecords: 0,
    unapprovedRecords: 0,
    missingFactorRecords: 0,
    sampleFactorRecords: 0,
    zeroAmountRecords: 0,
    calculationErrorRecords: 0,
    includedRecordsCount: 0,
    excludedRecordsCount: 0,
    inclusionPolicy: "approved_only",
    reportsGenerated: 0,
    reportStatus: "NOT_GENERATED",
    supplierIntelligence: {
      bestPerformingSupplier: null,
      worstPerformingSupplier: null,
      categoriesWithHighestSupplierRisk: [],
      suppliersAboveBenchmark: 0,
      suppliersMissingBenchmarkData: 0,
    },
  },
  monthly: [],
  costVsEmissions: [],
  transportModes: [],
  scopeBreakdown: [],
  categories: [],
  facilities: [],
  dataQuality: {
    completenessPct: 0,
    requiredSignals: 6,
    completedSignals: 0,
    sampleFactorRecords: 0,
    missingFactorRecords: 0,
    zeroAmountRecords: 0,
    calculationErrorRecords: 0,
    calculatedRecords: 0,
    includedRecordsCount: 0,
    excludedRecordsCount: 0,
    inclusionPolicy: "approved_only",
    score: 0,
    issues: [],
    draftRecords: 0,
    submittedRecords: 0,
    reviewedRecords: 0,
    approvedRecords: 0,
    rejectedRecords: 0,
    needsCorrectionRecords: 0,
    unapprovedRecords: 0,
    status: "NEEDS_DATA",
  },
  reportStatus: {
    generatedCount: 0,
    latestStatus: "NOT_GENERATED",
    latestGeneratedAt: null,
  },
  totalRecords: 0,
  calculatedRecords: 0,
  draftRecords: 0,
  submittedRecords: 0,
  approvedRecords: 0,
  missingFactorRecords: 0,
  sampleFactorRecords: 0,
  zeroAmountRecords: 0,
  calculationErrorRecords: 0,
  includedRecordsCount: 0,
  excludedRecordsCount: 0,
  inclusionPolicy: "approved_only",
  scopeTotals: [],
  categoryTotals: [],
  monthlyTrend: [],
  dataQualityScore: 0,
  dataQualityIssues: [],
};

function normalizeInclusionPolicy(value: unknown): DashboardInclusionPolicy {
  return value === "all_records" || value === "draft_included" ? value : "approved_only";
}

function normalizeDashboardData(payload: unknown): DashboardData {
  if (!isRecord(payload)) {
    return EMPTY_DASHBOARD_DATA;
  }

  const summary = isRecord(payload.summary) ? payload.summary : {};
  const dataQuality = isRecord(payload.dataQuality) ? payload.dataQuality : {};
  const reportStatus = isRecord(payload.reportStatus) ? payload.reportStatus : {};
  const normalizeTransportValues = (value: unknown) => asArray<Record<string, unknown>>(value).map((item) => ({
    ...item,
    name: String(item.name || "Unknown"),
    value: asNumber(item.value),
  }));
  const normalizeScopeBreakdown = (value: unknown) => asArray<Record<string, unknown>>(value).map((item) => ({
    ...item,
    name: String(item.name || "Unknown"),
    value: asNumber(item.value),
    percentage: asNumber(item.percentage),
  }));
  const normalizeCategoryValues = (value: unknown) => asArray<Record<string, unknown>>(value).map((item) => ({
    ...item,
    name: String(item.name || "Unknown"),
    value: asNumber(item.value),
    scope1: asNumber(item.scope1),
    scope2: asNumber(item.scope2),
    scope3: asNumber(item.scope3),
  }));
  const normalizeMonthly = (value: unknown) => asArray<Record<string, unknown>>(value).map((item) => ({
    ...item,
    name: String(item.name || ""),
    scope1: asNumber(item.scope1),
    scope2: asNumber(item.scope2),
    scope3: asNumber(item.scope3),
    emissions: asNumber(item.emissions),
    cost: asNumber(item.cost),
  }));
  const normalizeIssues = (value: unknown): DashboardDataQualityIssue[] => asArray<Record<string, unknown>>(value).map((item) => {
    const severity: DashboardDataQualityIssue["severity"] = item.severity === "critical" || item.severity === "info" ? item.severity : "warning";
    return {
      type: String(item.type || "data_quality"),
      count: asNumber(item.count),
      message: String(item.message || "Data quality issue detected."),
      severity,
    };
  });
  const carbonIntensity = summary.carbonIntensity === null || summary.carbonIntensity === undefined || summary.carbonIntensity === ""
    ? null
    : asNumber(summary.carbonIntensity);
  const inclusionPolicy = normalizeInclusionPolicy(payload.inclusionPolicy || summary.inclusionPolicy || dataQuality.inclusionPolicy);
  const dataQualityIssues = normalizeIssues(payload.dataQualityIssues || dataQuality.issues);

  return {
    ...EMPTY_DASHBOARD_DATA,
    ...payload,
    totalRecords: asNumber(payload.totalRecords, asNumber(summary.totalRecords)),
    calculatedRecords: asNumber(payload.calculatedRecords, asNumber(summary.calculatedRecords)),
    draftRecords: asNumber(payload.draftRecords, asNumber(summary.draftRecords)),
    submittedRecords: asNumber(payload.submittedRecords, asNumber(summary.submittedRecords)),
    approvedRecords: asNumber(payload.approvedRecords, asNumber(summary.approvedRecords)),
    missingFactorRecords: asNumber(payload.missingFactorRecords, asNumber(summary.missingFactorRecords ?? summary.missingFactorCount)),
    sampleFactorRecords: asNumber(payload.sampleFactorRecords, asNumber(summary.sampleFactorRecords ?? summary.sampleFactorUsageCount)),
    zeroAmountRecords: asNumber(payload.zeroAmountRecords, asNumber(summary.zeroAmountRecords)),
    calculationErrorRecords: asNumber(payload.calculationErrorRecords, asNumber(summary.calculationErrorRecords)),
    includedRecordsCount: asNumber(payload.includedRecordsCount, asNumber(summary.includedRecordsCount)),
    excludedRecordsCount: asNumber(payload.excludedRecordsCount, asNumber(summary.excludedRecordsCount)),
    inclusionPolicy,
    dataQualityScore: asNumber(payload.dataQualityScore, asNumber(summary.dataQualityScore)),
    dataQualityIssues,
    summary: {
      ...EMPTY_DASHBOARD_DATA.summary,
      ...summary,
      totalEmissions: asNumber(summary.totalEmissions),
      scope1: asNumber(summary.scope1),
      scope2: asNumber(summary.scope2),
      scope3: asNumber(summary.scope3),
      carbonIntensity,
      totalCost: asNumber(summary.totalCost),
      totalLogisticsCost: asNumber(summary.totalLogisticsCost, asNumber(summary.totalCost)),
      totalOffsets: asNumber(summary.totalOffsets),
      offsetsRetired: asNumber(summary.offsetsRetired, asNumber(summary.totalOffsets)),
      highRiskSuppliers: asNumber(summary.highRiskSuppliers),
      activeProjects: asNumber(summary.activeProjects),
      averageSupplierScore: asNumber(summary.averageSupplierScore),
      totalSpend: asNumber(summary.totalSpend),
      totalCarbonTax: asNumber(summary.totalCarbonTax),
      dataCompletenessPct: asNumber(summary.dataCompletenessPct),
      dataQualityScore: asNumber(summary.dataQualityScore, asNumber(payload.dataQualityScore)),
      activitiesRecorded: asNumber(summary.activitiesRecorded),
      totalRecords: asNumber(summary.totalRecords),
      calculatedRecords: asNumber(summary.calculatedRecords),
      draftRecords: asNumber(summary.draftRecords),
      submittedRecords: asNumber(summary.submittedRecords),
      reviewedRecords: asNumber(summary.reviewedRecords),
      approvedRecords: asNumber(summary.approvedRecords),
      rejectedRecords: asNumber(summary.rejectedRecords),
      needsCorrectionRecords: asNumber(summary.needsCorrectionRecords),
      unapprovedRecords: asNumber(summary.unapprovedRecords),
      missingFactorRecords: asNumber(summary.missingFactorRecords ?? summary.missingFactorCount),
      sampleFactorRecords: asNumber(summary.sampleFactorRecords ?? summary.sampleFactorUsageCount),
      zeroAmountRecords: asNumber(summary.zeroAmountRecords),
      calculationErrorRecords: asNumber(summary.calculationErrorRecords),
      includedRecordsCount: asNumber(summary.includedRecordsCount),
      excludedRecordsCount: asNumber(summary.excludedRecordsCount),
      inclusionPolicy,
      supplierIntelligence: {
        bestPerformingSupplier: String((summary.supplierIntelligence as Record<string, unknown> | undefined)?.bestPerformingSupplier || "") || null,
        worstPerformingSupplier: String((summary.supplierIntelligence as Record<string, unknown> | undefined)?.worstPerformingSupplier || "") || null,
        categoriesWithHighestSupplierRisk: asArray<Record<string, unknown>>((summary.supplierIntelligence as Record<string, unknown> | undefined)?.categoriesWithHighestSupplierRisk).map((item) => ({
          category: String(item.category || "Uncategorized"),
          supplierCount: asNumber(item.supplierCount),
          aboveBenchmarkCount: asNumber(item.aboveBenchmarkCount),
        })),
        suppliersAboveBenchmark: asNumber((summary.supplierIntelligence as Record<string, unknown> | undefined)?.suppliersAboveBenchmark),
        suppliersMissingBenchmarkData: asNumber((summary.supplierIntelligence as Record<string, unknown> | undefined)?.suppliersMissingBenchmarkData),
      },
    },
    monthly: normalizeMonthly(payload.monthly),
    costVsEmissions: normalizeMonthly(payload.costVsEmissions),
    transportModes: normalizeTransportValues(payload.transportModes),
    scopeBreakdown: normalizeScopeBreakdown(payload.scopeBreakdown),
    categories: normalizeCategoryValues(payload.categories),
    facilities: normalizeTransportValues(payload.facilities),
    scopeTotals: normalizeScopeBreakdown(payload.scopeTotals || payload.scopeBreakdown),
    categoryTotals: normalizeCategoryValues(payload.categoryTotals || payload.categories),
    monthlyTrend: normalizeMonthly(payload.monthlyTrend || payload.monthly),
    dataQuality: {
      ...EMPTY_DASHBOARD_DATA.dataQuality,
      ...dataQuality,
      completenessPct: asNumber(dataQuality.completenessPct),
      requiredSignals: asNumber(dataQuality.requiredSignals, EMPTY_DASHBOARD_DATA.dataQuality.requiredSignals),
      completedSignals: asNumber(dataQuality.completedSignals),
      sampleFactorRecords: asNumber(dataQuality.sampleFactorRecords),
      missingFactorRecords: asNumber(dataQuality.missingFactorRecords),
      zeroAmountRecords: asNumber(dataQuality.zeroAmountRecords),
      calculationErrorRecords: asNumber(dataQuality.calculationErrorRecords),
      calculatedRecords: asNumber(dataQuality.calculatedRecords),
      includedRecordsCount: asNumber(dataQuality.includedRecordsCount),
      excludedRecordsCount: asNumber(dataQuality.excludedRecordsCount),
      inclusionPolicy,
      score: asNumber(dataQuality.score, asNumber(payload.dataQualityScore)),
      issues: dataQualityIssues,
      draftRecords: asNumber(dataQuality.draftRecords),
      submittedRecords: asNumber(dataQuality.submittedRecords),
      reviewedRecords: asNumber(dataQuality.reviewedRecords),
      approvedRecords: asNumber(dataQuality.approvedRecords),
      rejectedRecords: asNumber(dataQuality.rejectedRecords),
      needsCorrectionRecords: asNumber(dataQuality.needsCorrectionRecords),
      unapprovedRecords: asNumber(dataQuality.unapprovedRecords),
    },
    reportStatus: {
      ...EMPTY_DASHBOARD_DATA.reportStatus,
      ...reportStatus,
      generatedCount: asNumber(reportStatus.generatedCount),
    },
  };
}

export const dashboardService = {
  getMetrics: async (inclusionPolicy: DashboardInclusionPolicy = "approved_only") => {
    const query = new URLSearchParams({ inclusionPolicy });
    return normalizeDashboardData(await apiClient.get<unknown>(`/dashboard/summary?${query.toString()}`));
  },
};
