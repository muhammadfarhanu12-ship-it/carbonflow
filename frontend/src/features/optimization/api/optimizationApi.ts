import { apiClient, axiosClient } from "@/src/services/apiClient";
import type { OptimizationAnalysisResult, OptimizationAnalyzePayload, OptimizationRun, OptimizationStatus, OptimizationSummary } from "../types";

export const optimizationApi = {
  analyze: (payload: OptimizationAnalyzePayload) => apiClient.post<OptimizationAnalysisResult>("/optimization/analyze", payload),
  context: () => apiClient.get<OptimizationSummary>("/optimization/context"),
  runs: () => apiClient.get<OptimizationRun[]>("/optimization/runs"),
  run: (id: string) => apiClient.get<OptimizationRun>(`/optimization/runs/${id}`),
  updateRecommendationStatus: (id: string, status: OptimizationStatus) => (
    apiClient.patch(`/optimization/recommendations/${id}/status`, { status })
  ),
  exportRun: async (id: string, format: "PDF" | "CSV") => {
    const response = await axiosClient.post<Blob>(`/optimization/runs/${id}/export`, { format }, { responseType: "blob" });
    return response.data;
  },
};
