import { apiClient } from "./apiClient";
import type { PaginatedResponse } from "@/src/types/platform";

export interface ManagedEmissionFactor {
  id: string;
  companyId?: string | null;
  name: string;
  scope: 1 | 2 | 3;
  category: string;
  activityType: string;
  factorKey: string;
  activityUnit: string;
  factorValue: number;
  value?: number;
  unit?: string;
  factorUnit: string;
  sourceName: string;
  sourceYear: number;
  sourceUrl?: string | null;
  methodology?: string | null;
  country?: string | null;
  region: string;
  version: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  notes?: string | null;
  isSample: boolean;
  isOfficial: boolean;
  isCustom: boolean;
  isActive: boolean;
  canEdit?: boolean;
  factorStatus?: "custom" | "official" | "sample" | "configured";
}

export type FactorPayload = Partial<ManagedEmissionFactor> & {
  scope: 1 | 2 | 3;
  category: string;
  activityType: string;
  factorKey: string;
  activityUnit: string;
  factorValue: number;
  factorUnit: string;
  sourceName: string;
  sourceYear: number;
};

export interface FactorImportPreview {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateWarnings?: number;
  createdCount?: number;
  rows: Array<{
    rowNumber: number;
    valid: boolean;
    errors: string[];
    warnings?: string[];
    payload: Partial<ManagedEmissionFactor>;
  }>;
}

export interface FactorLibrarySummary {
  customFactors: number;
  officialFactors: number;
  sampleFactors: number;
  missingFactorsReferenced: number;
}

export interface FactorLibraryResponse extends PaginatedResponse<ManagedEmissionFactor> {
  summary?: FactorLibrarySummary;
}

export const factorLibraryService = {
  list: (params = "") => apiClient.get<FactorLibraryResponse>(`/emissions/factors${params}`),
  get: (id: string) => apiClient.get<ManagedEmissionFactor>(`/emissions/factors/${id}`),
  create: (payload: FactorPayload) => apiClient.post<ManagedEmissionFactor>("/emissions/factors", payload),
  update: (id: string, payload: Partial<FactorPayload>) => apiClient.patch<ManagedEmissionFactor>(`/emissions/factors/${id}`, payload),
  deactivate: (id: string) => apiClient.patch<ManagedEmissionFactor>(`/emissions/factors/${id}/deactivate`),
  reactivate: (id: string) => apiClient.patch<ManagedEmissionFactor>(`/emissions/factors/${id}/reactivate`),
  previewImport: (csv: string) => apiClient.post<FactorImportPreview>("/emissions/factors/preview-import", { csv }),
  commitImport: (csv: string) => apiClient.post<FactorImportPreview>("/emissions/factors/import", { csv }),
};
