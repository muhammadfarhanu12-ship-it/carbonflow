import { apiClient } from "./apiClient";
import type { PaginatedResponse } from "@/src/types/platform";

export interface ApprovalSummary {
  pendingEmissionApprovals: number;
  supplierEvidenceReviews: number;
  budgetRequests: number;
  marketplaceReviews: number;
  factorReviews: number;
  importIssues: number;
  totalPending: number;
}

export interface ApprovalItem {
  id: string;
  type: "emission_record" | "supplier_evidence" | "budget_request" | "marketplace_review" | string;
  title: string;
  status: string;
  priority: "low" | "medium" | "high" | string;
  submittedBy?: string | null;
  submittedAt?: string | null;
  relatedEntity?: string | null;
  description?: string | null;
}

export const approvalsService = {
  summary: () => apiClient.get<ApprovalSummary>("/approvals/summary"),
  list: (params = "") => apiClient.get<PaginatedResponse<ApprovalItem>>(`/approvals${params}`),
  approve: (type: string, id: string, notes?: string) => apiClient.post(`/approvals/${type}/${id}/approve`, { notes }),
  reject: (type: string, id: string, notes: string) => apiClient.post(`/approvals/${type}/${id}/reject`, { notes }),
  requestCorrection: (type: string, id: string, notes: string) => apiClient.post(`/approvals/${type}/${id}/request-correction`, { notes }),
};
