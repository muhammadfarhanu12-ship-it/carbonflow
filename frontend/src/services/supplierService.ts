import { apiClient, buildAbsoluteApiUrl } from "./apiClient";
import type {
  BulkSupplierScoreResponse,
  PaginatedResponse,
  Supplier,
  SupplierEvidence,
  SupplierEvidenceStatus,
  SupplierEvidenceType,
  SupplierIntelligenceSummary,
  SupplierInvitationStatus,
  SupplierQuestionnaire,
  SupplierQuestionnaireStatus,
  SupplierScoreResult,
  SupplierStatus,
  VerificationStatus,
} from "@/src/types/platform";
import { normalizePaginatedResponse } from "@/src/utils/apiResponse";

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
  status?: SupplierStatus;
  emissionFactor: number;
  emissionIntensity?: number | null;
  intensityUnit?: string;
  complianceScore?: number;
  verificationStatus?: VerificationStatus;
  onTimeDeliveryRate: number;
  renewableRatio: number;
  complianceFlags: number;
  totalEmissions: number;
  totalEmissionsTco2e?: number;
  revenue?: number | null;
  revenueOrActivityBase?: number | null;
  hasISO14001: boolean;
  hasSBTi: boolean;
  dataTransparencyScore: number;
  lastReportedAt?: string | null;
  invitationStatus?: SupplierInvitationStatus;
  questionnaireStatus?: SupplierQuestionnaireStatus;
  questionnaireDueDate?: string | null;
  certifications?: string[];
  notes?: string;
}

export interface SupplierEvidencePayload {
  evidenceType: SupplierEvidenceType;
  title: string;
  status?: SupplierEvidenceStatus;
  fileUrl?: string | null;
  uploadedAt?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
}

export interface SupplierSummary {
  total: number;
  averageEsgScore: number;
  averageTransparency: number;
  verified: number;
  invited: number;
  highRisk: number;
  missingData: number;
  totalEmissions: number;
  supplierIntelligence?: SupplierIntelligenceSummary;
}

export const supplierService = {
  getSuppliers: async (params = ""): Promise<PaginatedResponse<Supplier>> => (
    normalizePaginatedResponse<Supplier>(await apiClient.get<unknown>(`/suppliers${params}`))
  ),
  getSupplier: (id: string) => apiClient.get<Supplier>(`/suppliers/${id}`),
  getSummary: () => apiClient.get<SupplierSummary>("/suppliers/summary"),
  getScorecard: (id: string) => apiClient.get<SupplierScoreResult>(`/suppliers/${id}/scorecard`),
  createSupplier: (data: SupplierPayload) => apiClient.post<Supplier>("/suppliers", data),
  updateSupplier: (id: string, data: Partial<SupplierPayload>) => apiClient.patch<Supplier>(`/suppliers/${id}`, data),
  archiveSupplier: (id: string) => apiClient.patch<Supplier>(`/suppliers/${id}/archive`),
  recalculateScore: (id: string) => apiClient.post<Supplier>(`/suppliers/${id}/recalculate-score`, {}),
  sendQuestionnaire: (id: string, dueDate?: string | null) => apiClient.post<SupplierQuestionnaire>(`/suppliers/${id}/send-questionnaire`, { dueDate }),
  resendQuestionnaire: (id: string, dueDate?: string | null) => apiClient.post<SupplierQuestionnaire>(`/suppliers/${id}/resend-questionnaire`, { dueDate }),
  updateQuestionnaireStatus: (id: string, questionnaireStatus: SupplierQuestionnaireStatus, questionnaireDueDate?: string | null) => (
    apiClient.patch<SupplierQuestionnaire>(`/suppliers/${id}/questionnaire-status`, { questionnaireStatus, questionnaireDueDate })
  ),
  getQuestionnaire: (id: string) => apiClient.get<SupplierQuestionnaire>(`/suppliers/${id}/questionnaire`),
  getEvidence: (id: string) => apiClient.get<SupplierEvidence[]>(`/suppliers/${id}/evidence`),
  createEvidence: (id: string, data: SupplierEvidencePayload) => apiClient.post<SupplierEvidence>(`/suppliers/${id}/evidence`, data),
  uploadEvidence: (
    id: string,
    data: SupplierEvidencePayload,
    file: File,
    onUploadProgress?: (progress: number) => void,
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("evidenceType", data.evidenceType);
    formData.append("title", data.title || file.name);
    if (data.expiresAt) formData.append("expiresAt", data.expiresAt);
    if (data.notes) formData.append("notes", data.notes);
    return apiClient.postFormWithProgress<SupplierEvidence>(`/suppliers/${id}/evidence/upload`, formData, onUploadProgress);
  },
  downloadEvidenceUrl: (id: string, evidenceId: string) => buildAbsoluteApiUrl(`/suppliers/${id}/evidence/${evidenceId}/download`),
  updateEvidence: (id: string, evidenceId: string, data: Partial<SupplierEvidencePayload>) => apiClient.patch<SupplierEvidence>(`/suppliers/${id}/evidence/${evidenceId}`, data),
  verifyEvidence: (id: string, evidenceId: string) => apiClient.patch<SupplierEvidence>(`/suppliers/${id}/evidence/${evidenceId}/verify`, {}),
  rejectEvidence: (id: string, evidenceId: string, notes?: string | null) => apiClient.patch<SupplierEvidence>(`/suppliers/${id}/evidence/${evidenceId}/reject`, { notes }),
  deleteSupplier: (id: string) => apiClient.delete<{ success: boolean }>(`/suppliers/${id}`),
  scoreSupplier: (data: SupplierScorePayload) => apiClient.post<SupplierScoreResult>("/suppliers/score", data),
  scoreSuppliersBulk: (suppliers: SupplierScorePayload[]) => apiClient.post<BulkSupplierScoreResponse>("/suppliers/score/bulk", suppliers),
};
