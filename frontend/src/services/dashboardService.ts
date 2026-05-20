import { apiClient } from "./apiClient";
import type { DashboardData } from "@/src/types/platform";
import { asArray, asNumber, isRecord } from "@/src/utils/apiResponse";

export const EMPTY_DASHBOARD_DATA: DashboardData = {
  summary: {
    totalEmissions: 0,
    scope1: 0,
    scope2: 0,
    scope3: 0,
    carbonIntensity: 0,
    carbonIntensityUnit: "kgCO2e/USD",
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
    draftRecords: 0,
    submittedRecords: 0,
    reviewedRecords: 0,
    approvedRecords: 0,
    rejectedRecords: 0,
    needsCorrectionRecords: 0,
    unapprovedRecords: 0,
    reportsGenerated: 0,
    reportStatus: "NOT_GENERATED",
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
};

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

  return {
    ...EMPTY_DASHBOARD_DATA,
    ...payload,
    summary: {
      ...EMPTY_DASHBOARD_DATA.summary,
      ...summary,
      totalEmissions: asNumber(summary.totalEmissions),
      scope1: asNumber(summary.scope1),
      scope2: asNumber(summary.scope2),
      scope3: asNumber(summary.scope3),
      carbonIntensity: asNumber(summary.carbonIntensity),
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
      activitiesRecorded: asNumber(summary.activitiesRecorded),
      totalRecords: asNumber(summary.totalRecords),
      draftRecords: asNumber(summary.draftRecords),
      submittedRecords: asNumber(summary.submittedRecords),
      reviewedRecords: asNumber(summary.reviewedRecords),
      approvedRecords: asNumber(summary.approvedRecords),
      rejectedRecords: asNumber(summary.rejectedRecords),
      needsCorrectionRecords: asNumber(summary.needsCorrectionRecords),
      unapprovedRecords: asNumber(summary.unapprovedRecords),
    },
    monthly: normalizeMonthly(payload.monthly),
    costVsEmissions: normalizeMonthly(payload.costVsEmissions),
    transportModes: normalizeTransportValues(payload.transportModes),
    scopeBreakdown: normalizeScopeBreakdown(payload.scopeBreakdown),
    categories: normalizeCategoryValues(payload.categories),
    facilities: normalizeTransportValues(payload.facilities),
    dataQuality: {
      ...EMPTY_DASHBOARD_DATA.dataQuality,
      ...dataQuality,
      completenessPct: asNumber(dataQuality.completenessPct),
      requiredSignals: asNumber(dataQuality.requiredSignals, EMPTY_DASHBOARD_DATA.dataQuality.requiredSignals),
      completedSignals: asNumber(dataQuality.completedSignals),
      sampleFactorRecords: asNumber(dataQuality.sampleFactorRecords),
      missingFactorRecords: asNumber(dataQuality.missingFactorRecords),
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
  getMetrics: async () => normalizeDashboardData(await apiClient.get<unknown>("/dashboard/summary")),
};
