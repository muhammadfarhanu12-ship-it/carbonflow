import { apiClient } from "@/src/services/apiClient";
import type { OptimizationAnalysisResult, OptimizationAnalyzePayload } from "../types";

export const optimizationApi = {
  analyze: (payload: OptimizationAnalyzePayload) => apiClient.post<OptimizationAnalysisResult>("/optimization/analyze", payload),
};
