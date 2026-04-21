export type OptimizationImpactLevel = "High" | "Medium" | "Low";

export interface OptimizationRecommendation {
  id: string;
  title: string;
  impactLevel: OptimizationImpactLevel;
  type: string;
  description: string;
  emissionReduction: number;
  costImpact: number;
  actionLabel: string;
  actionUrl: string;
}

export interface OptimizationSummary {
  shipmentsAnalyzed: number;
  suppliersAnalyzed: number;
  routesAnalyzed: number;
  carriersAnalyzed: number;
  totalBaselineEmissions: number;
  totalBaselineCost: number;
  potentialEmissionReduction: number;
  potentialCostImpact: number;
  generatedAt: string;
}

export interface OptimizationAnalysisResult {
  query: string;
  recommendations: OptimizationRecommendation[];
  summary: OptimizationSummary;
}

export interface OptimizationAnalyzePayload {
  query: string;
}
