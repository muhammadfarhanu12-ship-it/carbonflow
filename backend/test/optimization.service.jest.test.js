const OptimizationService = require("../services/optimizationService");
const { hasPermission } = require("../middlewares/rbac");
const AuditService = require("../services/audit.service");
const { Company, OptimizationRecommendation, OptimizationRun } = require("../models");

function shipment(overrides = {}) {
  return {
    _id: overrides._id || `shipment-${Math.random()}`,
    companyId: "company-1",
    supplierId: "supplier-1",
    origin: "Shanghai",
    destination: "Los Angeles",
    distanceKm: 11000,
    transportMode: "AIR",
    carrier: "FastAir",
    weightKg: 1000,
    costUsd: 5000,
    emissionsTonnes: 12,
    carbonCostUsd: 600,
    ...overrides,
  };
}

describe("OptimizationService rule-based engine", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("generates route recommendations from repeated real shipments", () => {
    const shipments = [
      shipment({ _id: "s1" }),
      shipment({ _id: "s2", emissionsTonnes: 11 }),
      shipment({ _id: "s3", emissionsTonnes: 10 }),
    ];
    const routes = OptimizationService.buildRouteGroups(shipments);

    const recommendations = OptimizationService.analyzeRoutes(routes);

    expect(recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "route",
        affectedShipments: expect.arrayContaining(["s1", "s2", "s3"]),
        estimatedTco2eSavings: expect.any(Number),
      }),
    ]));
  });

  test("generates mode shift recommendations only when distance and emissions support it", () => {
    const routes = OptimizationService.buildRouteGroups([
      shipment({ _id: "air-1", distanceKm: 2200, transportMode: "AIR", emissionsTonnes: 8 }),
      shipment({ _id: "air-2", distanceKm: 2300, transportMode: "AIR", emissionsTonnes: 9 }),
    ]);

    const recommendations = OptimizationService.analyzeRoutes(routes);

    expect(recommendations.some((recommendation) => recommendation.category === "mode_shift")).toBe(true);
  });

  test("carrier recommendations require a real lower-emission alternative in company data", () => {
    const routes = OptimizationService.buildRouteGroups([
      shipment({ _id: "s1", carrier: "HighAir", emissionsTonnes: 15 }),
      shipment({ _id: "s2", carrier: "HighAir", emissionsTonnes: 16 }),
      shipment({ _id: "s3", carrier: "LowAir", emissionsTonnes: 6 }),
      shipment({ _id: "s4", carrier: "LowAir", emissionsTonnes: 6 }),
    ]);

    const recommendations = OptimizationService.analyzeCarriers(routes);

    expect(recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "carrier",
        explanation: expect.stringContaining("company's data"),
      }),
    ]));
  });

  test("supplier data gaps do not invent savings", () => {
    const recommendations = OptimizationService.analyzeSuppliers([], [{
      _id: "supplier-1",
      name: "Acme Metals",
      riskLevel: "LOW",
      dataTransparencyScore: 0,
      totalEmissionsTco2e: 0,
    }]);

    expect(recommendations[0]).toEqual(expect.objectContaining({
      category: "supplier",
      estimatedTco2eSavings: null,
      calculationBasis: OptimizationService.SAVINGS_UNAVAILABLE,
    }));
  });

  test("carbon ledger data quality recommendations do not invent savings", () => {
    const recommendations = OptimizationService.analyzeCarbonLedger([
      { _id: "record-1", factorIsSample: true, amountTonnes: 0, emissionsTCo2e: 0, dataStatus: "draft" },
    ]);

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.every((recommendation) => recommendation.estimatedTco2eSavings === null)).toBe(true);
  });

  test("financial exposure recommendation uses recorded carbon costs without claiming savings", () => {
    const recommendations = OptimizationService.analyzeFinancialExposure({
      shipments: [shipment({ carbonCostUsd: 700 })],
      ledgerEntries: [{ carbonTaxUsd: 300, emissionsTonnes: 10 }],
    });

    expect(recommendations[0]).toEqual(expect.objectContaining({
      category: "financial",
      estimatedTco2eSavings: null,
      estimatedCostImpact: null,
    }));
  });

  test("optimization RBAC allows admins to run and denies viewers from running", () => {
    expect(hasPermission({ role: "admin" }, "optimization:run")).toBe(true);
    expect(hasPermission({ role: "viewer" }, "optimization:run")).toBe(false);
    expect(hasPermission({ role: "viewer" }, "optimization:view")).toBe(true);
  });

  test("route recommendations are not generated when distance and weight cannot support tonne-km", () => {
    const routes = OptimizationService.buildRouteGroups([
      shipment({ _id: "bad-1", distanceKm: 0, weightKg: 0, emissionsTonnes: 10 }),
      shipment({ _id: "bad-2", distanceKm: 0, weightKg: 0, emissionsTonnes: 10 }),
      shipment({ _id: "bad-3", distanceKm: 0, weightKg: 0, emissionsTonnes: 10 }),
    ]);

    expect(OptimizationService.analyzeRoutes(routes)).toEqual([]);
  });

  test("missing shipment cost keeps cost impact null instead of inventing savings", () => {
    const routes = OptimizationService.buildRouteGroups([
      shipment({ _id: "s1", costUsd: 0, carbonCostUsd: 0 }),
      shipment({ _id: "s2", costUsd: 0, carbonCostUsd: 0 }),
      shipment({ _id: "s3", costUsd: 0, carbonCostUsd: 0 }),
    ]);

    const recommendation = OptimizationService.analyzeRoutes(routes).find((item) => item.category === "route");

    expect(recommendation.estimatedCostImpact).toBeNull();
    expect(recommendation.assumptions).toContain(OptimizationService.SAVINGS_UNAVAILABLE);
  });

  test("missing carrier alternatives produce no carrier switch recommendation", () => {
    const routes = OptimizationService.buildRouteGroups([
      shipment({ _id: "s1", carrier: "OnlyCarrier" }),
      shipment({ _id: "s2", carrier: "OnlyCarrier" }),
    ]);

    expect(OptimizationService.analyzeCarriers(routes)).toEqual([]);
  });

  test("AI disabled fallback remains rule based", async () => {
    const previous = process.env.AI_ENABLED;
    process.env.AI_ENABLED = "false";
    jest.spyOn(require("../models").Shipment, "find").mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });
    jest.spyOn(require("../models").Supplier, "find").mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });
    jest.spyOn(require("../models").EmissionRecord, "find").mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });
    jest.spyOn(require("../models").LedgerEntry, "find").mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });

    const context = await OptimizationService.getContext("company-1");

    expect(context.analysisMode).toBe("rule_based");
    process.env.AI_ENABLED = previous;
  });

  test("buildExport creates CSV and audit log for company-scoped run", async () => {
    jest.spyOn(OptimizationRun, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "run-1",
        companyId: "company-1",
        question: "Find route savings",
        analysisMode: "rule_based",
        filters: {},
        dataCoverage: { totalShipmentsAnalyzed: 1 },
        dataQualityIssues: [],
        createdAt: new Date("2026-05-22T00:00:00.000Z"),
      }),
    });
    jest.spyOn(OptimizationRecommendation, "find").mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            recommendationId: "rec-1",
            category: "route",
            priority: "high",
            title: "Consolidate lane",
            estimatedTco2eSavings: 1.2,
            estimatedCostImpact: null,
            confidenceScore: 0.8,
            effortLevel: "medium",
            implementationTimeframe: "30 days",
            affectedRecordsCount: 3,
            status: "suggested",
            assumptions: ["real data only"],
            requiredData: ["shipments"],
            nextActions: ["review"],
          },
        ]),
      }),
    });
    jest.spyOn(Company, "findById").mockReturnValue({ lean: jest.fn().mockResolvedValue({ name: "Acme" }) });
    const auditSpy = jest.spyOn(AuditService, "log").mockResolvedValue({});

    const file = await OptimizationService.buildExport("company-1", "run-1", "CSV", { id: "user-1", email: "admin@example.com" });

    expect(file.contentType).toContain("text/csv");
    expect(String(file.content)).toContain("rec-1");
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: "optimization_report_generated",
      companyId: "company-1",
      entityId: "run-1",
    }));
  });
});
