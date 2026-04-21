export enum RiskLevel {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export interface Supplier {
  id: string;
  name: string;
  totalEmissions: number;
  revenue?: number;
  emissionIntensity: number;
  hasISO14001: boolean;
  hasSBTi: boolean;
  dataTransparencyScore: number;
  lastReportedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  industry?: string;
  category?: string;
}

export interface SupplierScoreInsight {
  type: "warning" | "info";
  message: string;
}

export interface SupplierScoreBreakdown {
  emissionScore: number;
  certificationScore: number;
  transparencyScore: number;
}

export interface SupplierBenchmark {
  industryKey: string;
  industryLabel: string;
  industryAverageIntensity: number;
  percentileRank: number | null;
  industryComparison: "ABOVE_AVERAGE" | "AT_AVERAGE" | "BELOW_AVERAGE" | "UNKNOWN";
  isAboveIndustryAverage: boolean | null;
  variancePct: number | null;
}

export interface SupplierScoreResult {
  supplierId: string | null;
  supplierName: string;
  totalScore: number;
  riskLevel: RiskLevel;
  riskTrend?: string | null;
  emissionIntensity: number | null;
  intensitySource: "computed" | "provided" | "unavailable";
  breakdown: SupplierScoreBreakdown;
  benchmark: SupplierBenchmark;
  insights: SupplierScoreInsight[];
  calculatedAt: string;
}
