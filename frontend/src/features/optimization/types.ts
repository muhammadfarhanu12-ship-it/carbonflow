export type OptimizationAnalysisMode = "rule_based" | "ai_assisted" | "hybrid";
export type OptimizationCategory = "route" | "mode_shift" | "carrier" | "supplier" | "data_quality" | "financial";
export type OptimizationPriority = "low" | "medium" | "high" | "critical";
export type OptimizationStatus = "suggested" | "planned" | "in_progress" | "implemented" | "dismissed";

export interface OptimizationDataQualityIssue {
  code: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
}

export interface OptimizationRecommendation {
  id?: string;
  _id?: string;
  recommendationId: string;
  title: string;
  category: OptimizationCategory;
  priority: OptimizationPriority;
  estimatedTco2eSavings: number | null;
  estimatedCostImpact: number | null;
  confidenceScore: number;
  effortLevel: string;
  implementationTimeframe: string;
  affectedRecordsCount: number;
  affectedShipments: string[];
  affectedSuppliers: string[];
  explanation: string;
  assumptions: string[];
  requiredData: string[];
  nextActions: string[];
  dataUsed?: string[];
  calculationBasis?: string | null;
  status?: OptimizationStatus;
  createdAt: string;
}

export interface OptimizationSummary {
  totalShipmentsAnalyzed: number;
  shipmentsAnalyzed?: number;
  totalEmissionsAnalyzed: number;
  totalCostAnalyzed: number;
  routesAnalyzed: number;
  carriersAnalyzed: number;
  suppliersAnalyzed: number;
  ledgerRecordsAnalyzed: number;
  financialLedgerEntriesAnalyzed: number;
  dateRange: Record<string, unknown> | null;
  dataCompleteness: number;
  missingDataIssues: OptimizationDataQualityIssue[];
  analysisMode: OptimizationAnalysisMode;
  generatedAt: string;
  potentialTco2eSavings: number;
  potentialCostImpact: number;
}

export interface OptimizationAnalysisResult {
  runId?: string;
  question: string;
  query?: string;
  answerSummary: string;
  recommendations: OptimizationRecommendation[];
  analysisCoverage: OptimizationSummary;
  summary: OptimizationSummary;
  dataQualityIssues: OptimizationDataQualityIssue[];
  assumptions: string[];
  analysisMode: OptimizationAnalysisMode;
  generatedAt: string;
}

export interface OptimizationRun {
  id?: string;
  _id?: string;
  companyId: string;
  question: string;
  analysisMode: OptimizationAnalysisMode;
  filters: Record<string, unknown>;
  recommendations?: OptimizationRecommendation[];
  recommendationCount?: number;
  statusSummary?: Partial<Record<OptimizationStatus, number>>;
  dataCoverage?: OptimizationSummary;
  dataQualityIssues?: OptimizationDataQualityIssue[];
  createdBy?: string | null;
  createdAt: string;
}

export interface OptimizationAnalyzePayload {
  question: string;
  dateRange?: {
    start?: string;
    end?: string;
  };
  filters?: Record<string, string>;
}
