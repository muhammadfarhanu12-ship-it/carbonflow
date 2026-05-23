import { apiClient, buildAbsoluteApiUrl } from "./apiClient";
import type { PaginatedResponse } from "@/src/types/platform";

export type ImportType = "shipment" | "emission_activity" | "emission_factor" | "supplier" | "financial_ledger";

export interface ImportHistoryItem {
  id: string;
  importType: string;
  fileName: string;
  status: "previewed" | "committed" | "failed" | "partially_failed" | string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  createdRecords: number;
  uploadedBy?: string | null;
  uploadedAt: string;
  errors?: Array<Record<string, unknown>>;
}

export interface ImportPreview {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  missingFactorRows?: number;
  duplicateWarnings?: number;
  createdCount?: number;
  rows: Array<{
    rowNumber: number;
    valid: boolean;
    errors: string[];
    warnings?: string[];
    payload?: Record<string, unknown>;
  }>;
}

export const importWorkflowService = {
  list: (params = "") => apiClient.get<PaginatedResponse<ImportHistoryItem>>(`/imports${params}`),
  get: (id: string) => apiClient.get<ImportHistoryItem>(`/imports/${id}`),
  getErrors: (id: string) => apiClient.get<Array<Record<string, unknown>>>(`/imports/${id}/errors`),
  preview: (type: ImportType, csv: string, fileName?: string) => apiClient.post<ImportPreview>(`/imports/${type}/preview`, { csv, fileName }),
  commit: (type: ImportType, csv: string, fileName?: string) => apiClient.post<ImportPreview>(`/imports/${type}/commit`, { csv, fileName }),
  templateUrl: (type: ImportType) => buildAbsoluteApiUrl(`/imports/${type}/template`),
};
