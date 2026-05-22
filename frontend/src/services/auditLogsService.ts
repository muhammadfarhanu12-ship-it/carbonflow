import { apiClient } from "./apiClient";
import { axiosClient } from "./apiClient";
import type { AuditLogItem, AuditSummary, PaginatedResponse } from "@/src/types/platform";
import { normalizePaginatedResponse } from "@/src/utils/apiResponse";

export type AuditLogExportFormat = "csv" | "json";

function toQueryString(params: string | URLSearchParams | Record<string, string | number | undefined | null> = "") {
  if (typeof params === "string") return params.startsWith("?") || params === "" ? params : `?${params}`;
  if (params instanceof URLSearchParams) {
    const query = params.toString();
    return query ? `?${query}` : "";
  }
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      search.set(key, String(value).trim());
    }
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

function filenameFromDisposition(disposition?: string) {
  const match = /filename="?([^";]+)"?/i.exec(disposition || "");
  return match?.[1] || null;
}

export const auditLogsService = {
  getAuditLogs: async (params = ""): Promise<PaginatedResponse<AuditLogItem>> => (
    normalizePaginatedResponse<AuditLogItem>(await apiClient.get<unknown>(`/audit-logs${toQueryString(params)}`))
  ),
  getAuditLog: async (id: string): Promise<AuditLogItem> => (
    await apiClient.get<AuditLogItem>(`/audit-logs/${id}`)
  ),
  getEntityAuditLogs: async (entityType: string, entityId: string, params = ""): Promise<PaginatedResponse<AuditLogItem>> => (
    normalizePaginatedResponse<AuditLogItem>(await apiClient.get<unknown>(`/audit-logs/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}${toQueryString(params)}`))
  ),
  getSummary: async (params = ""): Promise<AuditSummary> => (
    await apiClient.get<AuditSummary>(`/audit-logs/summary${toQueryString(params)}`)
  ),
  exportAuditLogs: async (params: URLSearchParams, format: AuditLogExportFormat): Promise<{ blob: Blob; filename: string }> => {
    const exportParams = new URLSearchParams(params);
    exportParams.set("format", format);
    const response = await axiosClient.get(`/audit-logs/export?${exportParams.toString()}`, { responseType: "blob" });
    return {
      blob: response.data,
      filename: filenameFromDisposition(response.headers["content-disposition"]) || `audit-logs.${format}`,
    };
  },
};
