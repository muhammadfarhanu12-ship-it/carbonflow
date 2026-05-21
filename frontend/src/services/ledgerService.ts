import { apiClient } from "./apiClient";
import type { EmissionRecord, LedgerEntry, LedgerOverview } from "@/src/types/platform";
import { asArray, asNumber, isRecord, normalizePaginatedResponse } from "@/src/utils/apiResponse";

export interface LedgerPayload {
  shipmentId?: string;
  entryDate: string;
  category: LedgerEntry["category"];
  description: string;
  logisticsCostUsd: number;
  emissionsTonnes?: number;
  carbonTaxUsd?: number;
  offsetCostUsd?: number;
  internalCarbonPriceUsd?: number;
  currency?: string;
  supplierVendor?: string | null;
  emissionRecordId?: string | null;
}

const EMPTY_LEDGER_SUMMARY = {
  totalSpend: 0,
  totalCarbonTax: 0,
  totalCarbonCost: 0,
  totalEmissions: 0,
  carbonCostRatio: 0,
  scope1: 0,
  scope2: 0,
  scope3: 0,
};

function normalizeLedgerOverview(payload: unknown): LedgerOverview {
  const paginated = normalizePaginatedResponse<LedgerEntry>(payload);
  const source = isRecord(payload) ? payload : {};
  const summary = isRecord(source.summary) ? source.summary : {};
  const breakdowns = isRecord(source.breakdowns) ? source.breakdowns : {};

  return {
    ...paginated,
    records: asArray<EmissionRecord>(source.records),
    summary: {
      ...EMPTY_LEDGER_SUMMARY,
      totalSpend: asNumber(summary.totalSpend),
      totalCarbonTax: asNumber(summary.totalCarbonTax),
      totalCarbonCost: asNumber(summary.totalCarbonCost),
      totalEmissions: asNumber(summary.totalEmissions),
      carbonCostRatio: asNumber(summary.carbonCostRatio),
      scope1: asNumber(summary.scope1),
      scope2: asNumber(summary.scope2),
      scope3: asNumber(summary.scope3),
      totalTco2e: asNumber(summary.totalTco2e),
      scope1Tco2e: asNumber(summary.scope1Tco2e),
      scope2Tco2e: asNumber(summary.scope2Tco2e),
      scope3Tco2e: asNumber(summary.scope3Tco2e),
      totalRecords: asNumber(summary.totalRecords),
      approvedRecords: asNumber(summary.approvedRecords),
      draftRecords: asNumber(summary.draftRecords),
      submittedRecords: asNumber(summary.submittedRecords),
      reviewedRecords: asNumber(summary.reviewedRecords),
      rejectedRecords: asNumber(summary.rejectedRecords),
      needsCorrectionRecords: asNumber(summary.needsCorrectionRecords),
      archivedRecords: asNumber(summary.archivedRecords),
      missingFactorRecords: asNumber(summary.missingFactorRecords),
      sampleFactorRecords: asNumber(summary.sampleFactorRecords),
      zeroAmountRecords: asNumber(summary.zeroAmountRecords),
      calculationErrorRecords: asNumber(summary.calculationErrorRecords),
      supplierLinkedRecords: asNumber(summary.supplierLinkedRecords),
      unlinkedSupplierRecords: asNumber(summary.unlinkedSupplierRecords),
      missingFacilityRecords: asNumber(summary.missingFacilityRecords),
      missingReportingPeriodRecords: asNumber(summary.missingReportingPeriodRecords),
      inclusionPolicy: typeof summary.inclusionPolicy === "string" ? summary.inclusionPolicy as LedgerOverview["summary"]["inclusionPolicy"] : "approved_only",
    },
    breakdowns: {
      byCategory: asArray(breakdowns.byCategory),
      bySupplier: asArray(breakdowns.bySupplier),
      byMonth: asArray(breakdowns.byMonth),
    },
    categoryBreakdown: asArray(source.categoryBreakdown),
    supplierBreakdown: asArray(source.supplierBreakdown),
    monthlyBreakdown: asArray(source.monthlyBreakdown),
    financialExposure: isRecord(source.financialExposure)
      ? {
        totalSpend: asNumber(source.financialExposure.totalSpend),
        carbonTax: asNumber(source.financialExposure.carbonTax),
        ledgerCarbonCost: asNumber(source.financialExposure.ledgerCarbonCost),
        carbonCostRatio: asNumber(source.financialExposure.carbonCostRatio),
      }
      : undefined,
    dataQualityIssues: asArray(source.dataQualityIssues),
  };
}

export const ledgerService = {
  getEntries: async (params = "") => normalizeLedgerOverview(await apiClient.get<unknown>(`/ledger${params}`)),
  createEntry: (data: LedgerPayload) => apiClient.post<LedgerEntry>("/ledger", data),
  updateEntry: (id: string, data: Partial<LedgerPayload>) => apiClient.put<LedgerEntry>(`/ledger/${id}`, data),
  deleteEntry: (id: string) => apiClient.delete<{ success: boolean }>(`/ledger/${id}`),
};
