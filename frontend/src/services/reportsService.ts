import { apiClient, axiosClient } from "./apiClient";
import type { PaginatedResponse, ReportItem } from "@/src/types/platform";

export interface ReportPayload {
  name: string;
  type: ReportItem["type"];
  format: ReportItem["format"];
  metadata?: Record<string, unknown>;
}

export const reportsService = {
  getReports: (params = "") => apiClient.get<PaginatedResponse<ReportItem>>(`/reports${params}`),
  generateReport: (data: ReportPayload) => apiClient.post<ReportItem>("/reports/generate", data),
  downloadReport: async (downloadUrl: string) => {
    const response = await axiosClient.get<Blob>(downloadUrl, { responseType: "blob" });
    return response.data;
  },
};
