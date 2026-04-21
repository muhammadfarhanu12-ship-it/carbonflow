import { apiClient } from "./apiClient";
import type { LedgerEntry, LedgerOverview } from "@/src/types/platform";

export interface LedgerPayload {
  shipmentId?: string;
  entryDate: string;
  category: LedgerEntry["category"];
  description: string;
  logisticsCostUsd: number;
  emissionsTonnes?: number;
}

export const ledgerService = {
  getEntries: (params = "") => apiClient.get<LedgerOverview>(`/ledger${params}`),
  createEntry: (data: LedgerPayload) => apiClient.post<LedgerEntry>("/ledger", data),
  updateEntry: (id: string, data: Partial<LedgerPayload>) => apiClient.put<LedgerEntry>(`/ledger/${id}`, data),
  deleteEntry: (id: string) => apiClient.delete<{ success: boolean }>(`/ledger/${id}`),
};
