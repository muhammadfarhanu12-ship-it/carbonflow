import { apiClient } from "./apiClient";
import type { PaginatedResponse } from "@/src/types/platform";

export interface ApprovalSummary {
  pendingEmissionApprovals: number;
  supplierEvidenceReviews: number;
  budgetRequests: number;
  marketplaceReviews: number;
  factorReviews: number;
  importIssues: number;
  highPriority?: number;
  criticalPriority?: number;
  totalPending: number;
}

export interface ApprovalAction {
  action: "approve" | "reject" | "request_correction" | string;
  enabled: boolean;
  requiresNotes?: boolean;
  requiresReason?: boolean;
  disabledReason?: string | null;
}

export interface ApprovalTimelineItem {
  id: string;
  action: string;
  timestamp?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  notes?: string | null;
}

export interface ApprovalItem {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  status: string;
  priority: "low" | "medium" | "high" | "critical" | string;
  submittedBy?: string | null;
  submittedByEmail?: string | null;
  submittedAt?: string | null;
  assignedTo?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  relatedEntityLabel?: string | null;
  relatedEntity?: string | null;
  module?: string | null;
  riskFlags?: string[];
  dataQualityWarnings?: string[];
  availableActions?: ApprovalAction[];
  actionRequiredByRole?: string | null;
  dataSummary?: Record<string, unknown>;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  previousComments?: string[];
  reviewChecklist?: string[];
  auditTimeline?: ApprovalTimelineItem[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ApprovalListParams {
  type?: string;
  status?: string;
  priority?: string;
  submittedBy?: string;
  assignedTo?: string;
  dateFrom?: string;
  dateTo?: string;
  module?: string;
  search?: string;
}

function toQuery(params: ApprovalListParams = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

export const approvalsService = {
  summary: () => apiClient.get<ApprovalSummary>("/approvals/summary"),
  list: (params: ApprovalListParams | string = "") => {
    const query = typeof params === "string" ? params : toQuery(params);
    return apiClient.get<PaginatedResponse<ApprovalItem>>(`/approvals${query}`);
  },
  get: (type: string, id: string) => apiClient.get<ApprovalItem>(`/approvals/${type}/${id}`),
  approve: (type: string, id: string, notes?: string, paymentReference?: string) => apiClient.post(`/approvals/${type}/${id}/approve`, { notes, paymentReference }),
  reject: (type: string, id: string, notes: string) => apiClient.post(`/approvals/${type}/${id}/reject`, { notes }),
  requestCorrection: (type: string, id: string, notes: string) => apiClient.post(`/approvals/${type}/${id}/request-correction`, { notes }),
  assign: (type: string, id: string, assignedTo?: string, notes?: string) => apiClient.post(`/approvals/${type}/${id}/assign`, { assignedTo, notes }),
};
