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
    },
    breakdowns: {
      byCategory: asArray(breakdowns.byCategory),
      bySupplier: asArray(breakdowns.bySupplier),
      byMonth: asArray(breakdowns.byMonth),
    },
  };
}

export const ledgerService = {
  getEntries: async (params = "") => normalizeLedgerOverview(await apiClient.get<unknown>(`/ledger${params}`)),
  createEntry: (data: LedgerPayload) => apiClient.post<LedgerEntry>("/ledger", data),
  updateEntry: (id: string, data: Partial<LedgerPayload>) => apiClient.put<LedgerEntry>(`/ledger/${id}`, data),
  deleteEntry: (id: string) => apiClient.delete<{ success: boolean }>(`/ledger/${id}`),
};
