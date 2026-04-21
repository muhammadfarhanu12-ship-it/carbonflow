import { optimizationApi } from "../api/optimizationApi";

export const SUGGESTED_OPTIMIZATION_QUERIES = [
  "Identify top 5 emitting routes",
  "Air vs Ocean cost-carbon analysis",
];

function normalizeOptimizationQuery(query: string) {
  return query.replace(/\s+/g, " ").trim();
}

export const optimizationService = {
  suggestedQueries: SUGGESTED_OPTIMIZATION_QUERIES,
  normalizeQuery: normalizeOptimizationQuery,
  async analyze(query: string) {
    const normalizedQuery = normalizeOptimizationQuery(query);

    if (!normalizedQuery) {
      throw new Error("Enter a query to analyze your shipment network.");
    }

    return optimizationApi.analyze({ query: normalizedQuery });
  },
};
