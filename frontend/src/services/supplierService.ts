import { apiClient } from "./apiClient";
import type {
  BulkSupplierScoreResponse,
  PaginatedResponse,
  Supplier,
  SupplierScoreResult,
} from "@/src/types/platform";

export interface SupplierScorePayload {
  id?: string;
  name: string;
  totalEmissions?: number | null;
  revenue?: number | null;
  emissionIntensity?: number | null;
  emissionFactor?: number | null;
  hasISO14001?: boolean;
  hasSBTi?: boolean;
  dataTransparencyScore?: number;
  lastReportedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  category?: string;
  industry?: string;
}

export interface SupplierPayload extends SupplierScorePayload {
  name: string;
  contactEmail: string;
  country: string;
  region: string;
  category: string;
  emissionFactor: number;
  emissionIntensity?: number | null;
  complianceScore?: number;
  verificationStatus?: Supplier["verificationStatus"];
  onTimeDeliveryRate: number;
  renewableRatio: number;
  complianceFlags: number;
  totalEmissions: number;
  revenue?: number | null;
  hasISO14001: boolean;
  hasSBTi: boolean;
  dataTransparencyScore: number;
  lastReportedAt?: string | null;
  invitationStatus?: Supplier["invitationStatus"];
  notes?: string;
}

export const supplierService = {
  getSuppliers: (params = "") => apiClient.get<PaginatedResponse<Supplier>>(`/suppliers${params}`),
  getSupplier: (id: string) => apiClient.get<Supplier>(`/suppliers/${id}`),
  createSupplier: (data: SupplierPayload) => apiClient.post<Supplier>("/suppliers", data),
  updateSupplier: (id: string, data: Partial<SupplierPayload>) => apiClient.put<Supplier>(`/suppliers/${id}`, data),
  deleteSupplier: (id: string) => apiClient.delete<{ success: boolean }>(`/suppliers/${id}`),
  scoreSupplier: (data: SupplierScorePayload) => apiClient.post<SupplierScoreResult>("/suppliers/score", data),
  scoreSuppliersBulk: (suppliers: SupplierScorePayload[]) => apiClient.post<BulkSupplierScoreResponse>("/suppliers/score/bulk", suppliers),
};
