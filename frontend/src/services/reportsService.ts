import { apiClient, axiosClient } from "./apiClient";
import type { PaginatedResponse, ReportItem } from "@/src/types/platform";
import { normalizePaginatedResponse } from "@/src/utils/apiResponse";

export interface ReportPayload {
  reportName?: string;
  name?: string;
  reportType?: ReportItem["reportType"];
  type?: ReportItem["type"];
  outputFormat?: ReportItem["format"];
  format?: ReportItem["format"];
  reportingPeriodStart?: string;
  reportingPeriodEnd?: string;
  inclusionPolicy?: "approved_only" | "all_records_with_warning";
  dataSections?: string[];
  metadata?: Record<string, unknown>;
}

export interface ReportReadiness {
  approvedRecordsCount: number;
  draftRecordsCount: number;
  submittedRecordsCount: number;
  rejectedRecordsCount: number;
  needsCorrectionRecordsCount: number;
  missingFactorCount: number;
  sampleFactorCount: number;
  staleFactorCount: number;
  zeroAmountCount: number;
  calculationErrorCount: number;
  supplierLinkedCount: number;
  unlinkedSupplierCount: number;
  officialFactorCount: number;
  customFactorCount: number;
  reportingPeriodCoverage: {
    requestedStart?: string | null;
    requestedEnd?: string | null;
    earliestRecordDate?: string | null;
    latestRecordDate?: string | null;
    recordCount: number;
  };
  canGenerateApprovedReport: boolean;
  canGenerateInternalReport: boolean;
  blockers: string[];
  warnings: string[];
  recommendations: string[];
}

export const reportsService = {
  getReports: async (params = ""): Promise<PaginatedResponse<ReportItem>> => (
    normalizePaginatedResponse<ReportItem>(await apiClient.get<unknown>(`/reports${params}`))
  ),
  checkReadiness: (data: Pick<ReportPayload, "reportingPeriodStart" | "reportingPeriodEnd">) => (
    apiClient.post<ReportReadiness>("/reports/readiness", data)
  ),
  generateReport: (data: ReportPayload) => apiClient.post<ReportItem>("/reports/generate", data),
  archiveReport: (id: string) => apiClient.patch<ReportItem>(`/reports/${id}/archive`, {}),
  regenerateReport: (id: string) => apiClient.post<ReportItem>(`/reports/${id}/regenerate`, {}),
  getReportAudit: (id: string) => apiClient.get(`/reports/${id}/audit`),
  downloadReportFile: async (report: ReportItem) => {
    const response = await axiosClient.get(`/reports/${report.id}/download`, { responseType: "blob" });
    const blob = response.data as Blob;
    if (!blob || blob.size === 0) {
      throw new Error("Report file is empty.");
    }
    const contentDisposition = String(response.headers["content-disposition"] || "");
    const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
    return {
      blob,
      fileName: fileNameMatch?.[1] || `${report.name.replace(/[^a-z0-9-]+/gi, "_")}.${report.format.toLowerCase()}`,
    };
  },
  downloadReport: async (downloadUrl: string) => {
    const response = await axiosClient.get(downloadUrl, { responseType: "blob" });
    const blob = response.data as Blob;
    if (!blob || blob.size === 0) {
      throw new Error("Report file is empty.");
    }
    return blob;
  },
  downloadReportAuthenticated: async (reportOrUrl: ReportItem | string) => {
    const report = typeof reportOrUrl === "string" ? null : reportOrUrl;
    const downloadUrl = report ? `/reports/${report.id}/download` : String(reportOrUrl);
    const response = await axiosClient.get(downloadUrl, { responseType: "blob" });
    const blob = response.data as Blob;
    if (!blob || blob.size === 0) {
      throw new Error("Report file is empty.");
    }
    const contentDisposition = String(response.headers["content-disposition"] || "");
    const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
    return {
      blob,
      fileName: fileNameMatch?.[1] || (report ? `${report.name.replace(/[^a-z0-9-]+/gi, "_")}.${report.format.toLowerCase()}` : "report-download"),
    };
  },
};
