import { apiClient } from "./apiClient";
import type { EmissionRecord, PaginatedResponse } from "@/src/types/platform";
import { asArray, isRecord, normalizePaginatedResponse } from "@/src/utils/apiResponse";

export interface EmissionActivityPayload {
  scope: 1 | 2 | 3;
  category: string;
  activityType: string;
  activityAmount: number;
  activityUnit: string;
  fuelType?: string;
  factorKey?: string;
  factorValue?: number;
  description?: string;
  facilityName?: string;
  businessUnit?: string;
  country?: string;
  region?: string;
  supplier?: string;
  supplierName?: string;
  supplierId?: string | null;
  shipmentId?: string | null;
  reportingPeriod?: string;
  reportingPeriodStart?: string | null;
  reportingPeriodEnd?: string | null;
  occurredAt?: string;
  activityDate?: string;
  dataStatus?: "draft" | "submitted";
}

export interface EmissionFactor {
  id?: string;
  scope: 1 | 2 | 3;
  category: string;
  activityType: string;
  factorKey?: string | null;
  activityUnit?: string | null;
  factorValue?: number;
  unit: string;
  value: number;
  factorUnit: string;
  sourceName: string;
  sourceYear: number;
  country?: string | null;
  region: string;
  isSample: boolean;
}

export interface EmissionImportPreview {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  missingFactorRows?: number;
  sampleFactorRows?: number;
  estimatedKgCo2e?: number;
  estimatedTCo2e?: number;
  rows: Array<{
    rowNumber: number;
    valid: boolean;
    errors: string[];
    payload: EmissionActivityPayload;
    factor: {
      id: string | null;
      name: string;
      factorValue: number;
      factorUnit: string;
      sourceName: string;
      sourceYear: number;
      isSample: boolean;
    } | null;
    calculation: {
      activityAmount: number;
      activityUnit: string;
      factorValue: number;
      factorUnit: string;
      factorSource: string;
      factorSourceYear: number;
      factorRegion: string;
      factorCountry: string | null;
      factorIsSample: boolean;
      emissionsKgCo2e: number;
      emissionsTCo2e: number;
      amountTonnes: number;
    } | null;
  }>;
  validRowItems: EmissionImportPreview["rows"];
  invalidRowItems: EmissionImportPreview["rows"];
  createdCount?: number;
}

export interface AuditTimelineItem {
  id: string;
  action: string;
  timestamp: string;
  userId?: string | null;
  userEmail?: string | null;
  oldValueSummary?: Record<string, unknown> | null;
  newValueSummary?: Record<string, unknown> | null;
  notes?: string | null;
  source: string;
}

export const emissionsService = {
  getActivities: async (params = ""): Promise<PaginatedResponse<EmissionRecord>> => (
    normalizePaginatedResponse<EmissionRecord>(await apiClient.get<unknown>(`/emissions${params}`))
  ),
  getFactors: async (params = "") => {
    const response = await apiClient.get<unknown>(`/emissions/factors${params}`);
    return Array.isArray(response)
      ? response as EmissionFactor[]
      : isRecord(response)
        ? asArray<EmissionFactor>(response.data)
        : [];
  },
  matchFactor: (params = "") => apiClient.get<EmissionFactor | null>(`/emissions/factors/match${params}`),
  createActivity: (payload: EmissionActivityPayload) => apiClient.post<EmissionRecord>("/emissions/activities", payload),
  updateActivity: (id: string, payload: Partial<EmissionActivityPayload> & { editReason?: string }) => apiClient.patch<EmissionRecord>(`/emissions/${id}`, payload),
  updateStatus: (id: string, dataStatus: string, notes?: string) => apiClient.patch<EmissionRecord>(`/emissions/${id}/status`, { dataStatus, notes }),
  recalculate: (id: string, reason?: string) => apiClient.post<EmissionRecord>(`/emissions/${id}/recalculate`, { reason }),
  getAuditTimeline: (id: string) => apiClient.get<AuditTimelineItem[]>(`/emissions/${id}/audit-timeline`),
  previewImport: (csv: string) => apiClient.post<EmissionImportPreview>("/emissions/import/preview", { csv }),
  commitImport: (csv: string) => apiClient.post<EmissionImportPreview>("/emissions/import/commit", { csv }),
};
