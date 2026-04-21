import { create } from "zustand";
import { optimizationService } from "../services/optimizationService";
import type { OptimizationAnalysisResult } from "../types";

type OptimizationStoreState = {
  loading: boolean;
  error: string | null;
  results: OptimizationAnalysisResult | null;
  lastSubmittedQuery: string;
  analyze: (query: string) => Promise<OptimizationAnalysisResult>;
  retry: () => Promise<OptimizationAnalysisResult>;
  clearError: () => void;
};

export const useOptimizationStore = create<OptimizationStoreState>((set, get) => ({
  loading: false,
  error: null,
  results: null,
  lastSubmittedQuery: "",
  async analyze(query) {
    const normalizedQuery = optimizationService.normalizeQuery(query);

    if (!normalizedQuery) {
      const message = "Enter a query to analyze your shipment network.";
      set({ error: message });
      throw new Error(message);
    }

    set({
      loading: true,
      error: null,
      lastSubmittedQuery: normalizedQuery,
    });

    try {
      const results = await optimizationService.analyze(normalizedQuery);

      set({
        loading: false,
        error: null,
        results,
        lastSubmittedQuery: normalizedQuery,
      });

      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Optimization analysis failed";

      set({
        loading: false,
        error: message,
        lastSubmittedQuery: normalizedQuery,
      });

      throw error instanceof Error ? error : new Error(message);
    }
  },
  async retry() {
    const { lastSubmittedQuery, analyze } = get();

    if (!lastSubmittedQuery) {
      const message = "Run an analysis first before retrying.";
      set({ error: message });
      throw new Error(message);
    }

    return analyze(lastSubmittedQuery);
  },
  clearError() {
    set({ error: null });
  },
}));
