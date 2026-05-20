import { apiClient } from "./apiClient";
import type { AuditLogItem, PaginatedResponse } from "@/src/types/platform";
import { normalizePaginatedResponse } from "@/src/utils/apiResponse";

export const auditLogsService = {
  getAuditLogs: async (params = ""): Promise<PaginatedResponse<AuditLogItem>> => (
    normalizePaginatedResponse<AuditLogItem>(await apiClient.get<unknown>(`/audit-logs${params}`))
  ),
};
