import { apiClient, axiosClient } from "./apiClient";
import type { PaginatedResponse, ReportItem } from "@/src/types/platform";
import { normalizePaginatedResponse } from "@/src/utils/apiResponse";

export interface ReportPayload {
  name: string;
  type: ReportItem["type"];
  format: ReportItem["format"];
  metadata?: Record<string, unknown>;
}

export const reportsService = {
  getReports: async (params = ""): Promise<PaginatedResponse<ReportItem>> => (
    normalizePaginatedResponse<ReportItem>(await apiClient.get<unknown>(`/reports${params}`))
  ),
  generateReport: (data: ReportPayload) => apiClient.post<ReportItem>("/reports/generate", data),
  downloadReport: async (downloadUrl: string) => {
    const response = await axiosClient.get<Blob>(downloadUrl, { responseType: "blob" });
    return response.data;
  },
};
