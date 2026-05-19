import { apiClient } from "./apiClient";
import type { AuditLogItem, PaginatedResponse } from "@/src/types/platform";

export const auditLogsService = {
  getAuditLogs: (params = "") => apiClient.get<PaginatedResponse<AuditLogItem>>(`/audit-logs${params}`),
};
