import { create } from "zustand";
import { optimizationService } from "../services/optimizationService";
import type { OptimizationAnalysisResult, OptimizationRun, OptimizationSummary, OptimizationStatus } from "../types";

type OptimizationStoreState = {
  loading: boolean;
  error: string | null;
  results: OptimizationAnalysisResult | null;
  context: OptimizationSummary | null;
  runs: OptimizationRun[];
  exporting: boolean;
  lastSubmittedQuery: string;
  loadContext: () => Promise<OptimizationSummary>;
  loadRuns: () => Promise<OptimizationRun[]>;
  openRun: (id: string) => Promise<OptimizationRun>;
  analyze: (query: string, filters?: Record<string, string>) => Promise<OptimizationAnalysisResult>;
  retry: () => Promise<OptimizationAnalysisResult>;
  updateStatus: (id: string, status: OptimizationStatus) => Promise<void>;
  exportRun: (id: string, format: "PDF" | "CSV") => Promise<Blob>;
  clearError: () => void;
};

export const useOptimizationStore = create<OptimizationStoreState>((set, get) => ({
  loading: false,
  error: null,
  results: null,
  context: null,
  runs: [],
  exporting: false,
  lastSubmittedQuery: "",
  async loadContext() {
    try {
      const context = await optimizationService.context();
      set({ context });
      return context;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Optimization context failed";
      set({ error: message });
      throw error instanceof Error ? error : new Error(message);
    }
  },
  async analyze(query, filters) {
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
      const results = await optimizationService.analyze(normalizedQuery, filters);

      set({
        loading: false,
        error: null,
        results,
        context: results.summary,
        lastSubmittedQuery: normalizedQuery,
      });
      void get().loadRuns();

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
  async loadRuns() {
    const runs = await optimizationService.runs();
    set({ runs });
    return runs;
  },
  async openRun(id) {
    const run = await optimizationService.run(id);
    const summary = run.dataCoverage;
    set({
      results: summary
        ? {
          runId: run.id || run._id,
          question: run.question,
          query: run.question,
          answerSummary: `Loaded saved optimization run with ${(run.recommendations || []).length} recommendations.`,
          recommendations: run.recommendations || [],
          analysisCoverage: summary,
          summary,
          dataQualityIssues: run.dataQualityIssues || [],
          assumptions: ["Loaded from saved company-scoped optimization history."],
          analysisMode: run.analysisMode,
          generatedAt: run.createdAt,
        }
        : get().results,
    });
    return run;
  },
  async updateStatus(id, status) {
    await optimizationService.updateRecommendationStatus(id, status);
    set((state) => ({
      results: state.results
        ? {
          ...state.results,
          recommendations: state.results.recommendations.map((recommendation) => {
            const recommendationId = recommendation.id || recommendation._id || recommendation.recommendationId;
            return recommendationId === id ? { ...recommendation, status } : recommendation;
          }),
        }
        : state.results,
    }));
  },
  async exportRun(id, format) {
    set({ exporting: true, error: null });
    try {
      const blob = await optimizationService.exportRun(id, format);
      set({ exporting: false });
      return blob;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Optimization export failed";
      set({ exporting: false, error: message });
      throw error instanceof Error ? error : new Error(message);
    }
  },
  clearError() {
    set({ error: null });
  },
}));
