import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { OptimizationPage } from "./OptimizationPage";
import type { OptimizationAnalysisResult, OptimizationSummary } from "@/src/features/optimization/types";

const mocks = vi.hoisted(() => ({
  loadContext: vi.fn(),
  analyze: vi.fn(),
  retry: vi.fn(),
  updateStatus: vi.fn(),
  loadRuns: vi.fn(),
  openRun: vi.fn(),
  exportRun: vi.fn(),
  clearError: vi.fn(),
  state: {} as Record<string, unknown>,
}));

vi.mock("@/src/components/providers/ToastProvider", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("@/src/features/optimization/hooks/useOptimizationStore", () => ({
  useOptimizationStore: () => mocks.state,
}));

const summary: OptimizationSummary = {
  totalShipmentsAnalyzed: 3,
  totalEmissionsAnalyzed: 42,
  totalCostAnalyzed: 12000,
  routesAnalyzed: 1,
  carriersAnalyzed: 2,
  suppliersAnalyzed: 1,
  ledgerRecordsAnalyzed: 2,
  financialLedgerEntriesAnalyzed: 1,
  dateRange: null,
  dataCompleteness: 92,
  missingDataIssues: [],
  analysisMode: "rule_based",
  generatedAt: "2026-05-22T00:00:00.000Z",
  potentialTco2eSavings: 8,
  potentialCostImpact: -500,
};

const result: OptimizationAnalysisResult = {
  runId: "run-1",
  question: "Find route savings",
  query: "Find route savings",
  answerSummary: "CarbonFlow found 1 data-backed optimization recommendations using real company shipments.",
  recommendations: [{
    id: "rec-1",
    recommendationId: "route_1",
    title: "Consolidate repeated Shanghai to Los Angeles AIR shipments",
    category: "route",
    priority: "high",
    estimatedTco2eSavings: 8,
    estimatedCostImpact: -500,
    confidenceScore: 0.78,
    effortLevel: "medium",
    implementationTimeframe: "30-60 days",
    affectedRecordsCount: 3,
    affectedShipments: ["s1", "s2"],
    affectedSuppliers: [],
    explanation: "3 real shipments support this recommendation.",
    assumptions: ["Savings use a conservative consolidation factor."],
    requiredData: ["distance", "weight"],
    nextActions: ["Review dispatch frequency."],
    dataUsed: ["3 shipments"],
    calculationBasis: "estimated savings = lane emissions x conservative consolidation factor",
    status: "suggested",
    createdAt: "2026-05-22T00:00:00.000Z",
  }],
  analysisCoverage: summary,
  summary,
  dataQualityIssues: [{ code: "missing_shipment_cost", severity: "medium", message: "1 shipments are missing usable cost data." }],
  assumptions: ["Rule-based optimization uses company-scoped records only."],
  analysisMode: "rule_based",
  generatedAt: "2026-05-22T00:00:00.000Z",
};

function renderPage() {
  render(
    <MemoryRouter>
      <OptimizationPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadContext.mockResolvedValue(summary);
  mocks.analyze.mockResolvedValue(result);
  mocks.retry.mockResolvedValue(result);
  mocks.updateStatus.mockResolvedValue(undefined);
  mocks.loadRuns.mockResolvedValue([]);
  mocks.openRun.mockResolvedValue({});
  mocks.exportRun.mockResolvedValue(new Blob(["ok"], { type: "text/csv" }));
  mocks.state = {
    loading: false,
    error: null,
    results: null,
    context: summary,
    runs: [],
    exporting: false,
    lastSubmittedQuery: "",
    loadContext: mocks.loadContext,
    loadRuns: mocks.loadRuns,
    analyze: mocks.analyze,
    retry: mocks.retry,
    updateStatus: mocks.updateStatus,
    openRun: mocks.openRun,
    exportRun: mocks.exportRun,
    clearError: mocks.clearError,
  };
});

describe("OptimizationPage", () => {
  test("renders rule-based mode and honest empty state", async () => {
    renderPage();

    expect(screen.getByText("AI Carbon Optimization")).toBeInTheDocument();
    expect(screen.getByText("Rule-based optimization")).toBeInTheDocument();
    expect(screen.getByText("Start with a supply-chain question")).toBeInTheDocument();
    expect(screen.queryByText(/mock recommendation/i)).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.loadContext).toHaveBeenCalled());
    await waitFor(() => expect(mocks.loadRuns).toHaveBeenCalled());
  });

  test("analyze button calls backend with filters", async () => {
    renderPage();

    await userEvent.type(screen.getByPlaceholderText(/How can we reduce emissions/i), "Find route savings");
    await userEvent.type(screen.getByPlaceholderText("Carrier"), "FastAir");
    await userEvent.click(screen.getByRole("button", { name: "Analyze" }));

    await waitFor(() => {
      expect(mocks.analyze).toHaveBeenCalledWith("Find route savings", expect.objectContaining({
        carrier: "FastAir",
      }));
    });
  });

  test("renders recommendations and data quality warnings", () => {
    mocks.state = { ...mocks.state, results: result };

    renderPage();

    expect(screen.getByText("Consolidate repeated Shanghai to Los Angeles AIR shipments")).toBeInTheDocument();
    expect(screen.getByText(/1 shipments are missing usable cost data/i)).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();
  });

  test("status action updates recommendation", async () => {
    mocks.state = { ...mocks.state, results: result };

    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /planned/i }));

    expect(mocks.updateStatus).toHaveBeenCalledWith("rec-1", "planned");
  });

  test("exports latest run through authenticated blob workflow", async () => {
    URL.createObjectURL = vi.fn(() => "blob:optimization");
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
    const appendChild = vi.spyOn(document.body, "appendChild");
    mocks.state = { ...mocks.state, results: result };

    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "CSV" }));

    expect(mocks.exportRun).toHaveBeenCalledWith("run-1", "CSV");
    expect(appendChild).toHaveBeenCalled();
  });

  test("backend errors render without crashing", () => {
    mocks.state = { ...mocks.state, error: "Optimization failed" };

    renderPage();

    expect(screen.getByText("Optimization analysis failed")).toBeInTheDocument();
    expect(screen.getByText("Optimization failed")).toBeInTheDocument();
  });
});
