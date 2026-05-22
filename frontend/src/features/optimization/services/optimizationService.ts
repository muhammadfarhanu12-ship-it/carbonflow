import { optimizationApi } from "../api/optimizationApi";

export const SUGGESTED_OPTIMIZATION_QUERIES = [
  "Identify top 5 emitting routes",
  "Air vs Ocean cost-carbon analysis",
  "Compare carrier emissions per tonne-km",
  "Find supplier emissions data gaps",
  "Show carbon ledger data quality issues",
];

function normalizeOptimizationQuery(query: string) {
  return query.replace(/\s+/g, " ").trim();
}

export const optimizationService = {
  suggestedQueries: SUGGESTED_OPTIMIZATION_QUERIES,
  normalizeQuery: normalizeOptimizationQuery,
  context: optimizationApi.context,
  runs: optimizationApi.runs,
  run: optimizationApi.run,
  updateRecommendationStatus: optimizationApi.updateRecommendationStatus,
  exportRun: optimizationApi.exportRun,
  async analyze(query: string, filters?: Record<string, string>) {
    const normalizedQuery = normalizeOptimizationQuery(query);

    if (!normalizedQuery) {
      throw new Error("Enter a query to analyze your shipment network.");
    }

    return optimizationApi.analyze({ question: normalizedQuery, filters });
  },
};
