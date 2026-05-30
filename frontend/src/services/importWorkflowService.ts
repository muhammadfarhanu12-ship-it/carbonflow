import { apiClient, buildAbsoluteApiUrl } from "./apiClient";
import type { PaginatedResponse } from "@/src/types/platform";

export type ImportType = "shipment" | "emission_activity" | "emission_factor" | "supplier" | "financial_ledger";

export interface ImportHistoryItem {
  id: string;
  previewId?: string;
  importType: string;
  fileName: string;
  status: "uploaded" | "previewed" | "committed" | "partially_committed" | "failed" | "cancelled" | string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows?: number;
  warningRows?: number;
  missingFactorRows?: number;
  sampleFactorRows?: number;
  estimatedTco2e?: number;
  createdRecords: number;
  createdRecordLinks?: Array<{ id: string; type?: string }>;
  uploadedBy?: string | null;
  uploadedAt: string;
  committedBy?: string | null;
  committedAt?: string | null;
  failedRows?: number;
  rowErrors?: Array<{ rowNumber?: number; message?: string; field?: string; factor?: string | null }>;
  rowWarnings?: Array<{ rowNumber?: number; message?: string; field?: string; factor?: string | null }>;
  rows?: ImportPreview["rows"];
  errors?: Array<Record<string, unknown>>;
}

export interface ImportPreview {
  previewId?: string;
  importId?: string;
  importType?: ImportType;
  fileName?: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows?: number;
  warningRows?: number;
  estimatedCreatedRecords?: number;
  missingFactorRows?: number;
  sampleFactorRows?: number;
  estimatedTco2e?: number;
  duplicateWarnings?: number;
  createdCount?: number;
  rowErrors?: Array<{ rowNumber?: number; message?: string; field?: string; factor?: string | null }>;
  rowWarnings?: Array<{ rowNumber?: number; message?: string; field?: string; factor?: string | null }>;
  rowPreview?: ImportPreview["rows"];
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
  commitById: (id: string) => apiClient.post<ImportPreview>(`/imports/${id}/commit`),
  commit: (type: ImportType, csv: string, fileName?: string) => apiClient.post<ImportPreview>(`/imports/${type}/commit`, { csv, fileName }),
  errorReportUrl: (id: string) => buildAbsoluteApiUrl(`/imports/${id}/error-report`),
  templateUrl: (type: ImportType) => buildAbsoluteApiUrl(`/imports/templates/${type}`),
};
