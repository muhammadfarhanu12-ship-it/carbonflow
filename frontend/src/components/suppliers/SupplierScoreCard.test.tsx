import { render, screen } from "@testing-library/react";
import { SupplierScoreCard } from "./SupplierScoreCard";

describe("SupplierScoreCard", () => {
  test("renders the Phase 2 empty state", () => {
    render(<SupplierScoreCard scoreResult={null} />);

    expect(screen.getByText("Select a supplier or create one to view the ESG scorecard.")).toBeInTheDocument();
  });

  test("renders explanations and recommended actions", () => {
    render(
      <SupplierScoreCard
        supplierName="Supplier One"
        scoreResult={{
          supplierId: "supplier-1",
          supplierName: "Supplier One",
          totalScore: 55,
          riskLevel: "HIGH",
          emissionIntensity: 1.2,
          intensitySource: "provided",
          breakdown: {
            emissionScore: 40,
            transparencyScore: 60,
            complianceScore: 50,
            certificationScore: 0,
            reportingFreshnessScore: 35,
            dataQualityScore: 65,
          },
          benchmark: {
            industryKey: "manufacturing",
            industryLabel: "Manufacturing",
            industryAverageIntensity: 1,
            percentileRank: 35,
            industryComparison: "ABOVE_AVERAGE",
            isAboveIndustryAverage: true,
            variancePct: 20,
          },
          insights: [],
          explanation: "Supplier is high risk because verification is pending.",
          recommendedActions: ["Request verified emissions data"],
          calculatedAt: new Date().toISOString(),
        }}
      />,
    );

    expect(screen.getByText("Supplier is high risk because verification is pending.")).toBeInTheDocument();
    expect(screen.getByText("Request verified emissions data")).toBeInTheDocument();
  });

  test("renders benchmark unavailable empty state", () => {
    render(
      <SupplierScoreCard
        scoreResult={{
          supplierId: "supplier-1",
          supplierName: "Supplier One",
          totalScore: 55,
          riskLevel: "HIGH",
          emissionIntensity: 1.2,
          intensitySource: "provided",
          breakdown: {
            emissionScore: 40,
            transparencyScore: 60,
            complianceScore: 50,
            certificationScore: 0,
            reportingFreshnessScore: 35,
            dataQualityScore: 65,
          },
          benchmark: {
            industryKey: "manufacturing",
            industryLabel: "Manufacturing",
            industryAverageIntensity: 1,
            percentileRank: null,
            industryComparison: "UNKNOWN",
            isAboveIndustryAverage: null,
            variancePct: null,
            categoryAverageIntensity: null,
            percentile: null,
            benchmarkLabel: "UNAVAILABLE",
            comparisonMessage: "Benchmark unavailable until more supplier data is collected.",
            isBenchmarkAvailable: false,
          },
          insights: [],
          explanation: "Supplier is high risk because verification is pending.",
          recommendedActions: [],
          calculatedAt: new Date().toISOString(),
        }}
      />,
    );

    expect(screen.getByText("Benchmark unavailable until more supplier data is collected.")).toBeInTheDocument();
  });

  test("renders benchmark source metadata and sample warning", () => {
    render(
      <SupplierScoreCard
        scoreResult={{
          supplierId: "supplier-1",
          supplierName: "Supplier One",
          totalScore: 72,
          riskLevel: "MEDIUM",
          emissionIntensity: 1.2,
          intensitySource: "provided",
          breakdown: {
            emissionScore: 70,
            transparencyScore: 70,
            complianceScore: 70,
            certificationScore: 70,
            reportingFreshnessScore: 70,
            dataQualityScore: 70,
          },
          benchmark: {
            industryKey: "manufacturing",
            industryLabel: "Manufacturing",
            industryAverageIntensity: 1,
            percentileRank: null,
            industryComparison: "BELOW_AVERAGE",
            isAboveIndustryAverage: false,
            variancePct: -10,
            categoryAverageIntensity: 1.5,
            percentile: null,
            benchmarkLabel: "BELOW_AVERAGE",
            comparisonMessage: "Supplier intensity is below the configured benchmark dataset.",
            isBenchmarkAvailable: true,
            categoryComparison: "BELOW_AVERAGE",
            regionComparison: "UNKNOWN",
            companyComparison: "UNKNOWN",
            benchmarkSource: "uploaded_benchmark_dataset",
            benchmarkSourceName: "Uploaded sample set",
            benchmarkSourceYear: 2026,
            benchmarkIsSample: true,
            benchmarkWarning: "Benchmark source is marked as sample data and must not be treated as official.",
          },
          insights: [],
          explanation: "Supplier is medium risk.",
          recommendedActions: [],
          calculatedAt: new Date().toISOString(),
        }}
      />,
    );

    expect(screen.getAllByText("Uploaded sample set 2026 (sample)").length).toBeGreaterThan(0);
    expect(screen.getByText("Benchmark source is marked as sample data and must not be treated as official.")).toBeInTheDocument();
  });
});
