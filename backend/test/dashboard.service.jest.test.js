const DashboardService = require("../services/dashboard.service");

const { buildDashboardPayload } = DashboardService._private;

function record(overrides = {}) {
  return {
    scope: 2,
    category: "Purchased Electricity",
    amountTonnes: 1.5,
    activityAmount: 100,
    factorValue: 0.4,
    factorIsSample: false,
    dataStatus: "approved",
    periodYear: new Date().getUTCFullYear(),
    periodMonth: new Date().getUTCMonth() + 1,
    ...overrides,
  };
}

describe("DashboardService dashboard payload", () => {
  test("returns safe empty dashboard data with approved-only policy", () => {
    const dashboard = buildDashboardPayload({ inclusionPolicy: "approved_only" });

    expect(dashboard.summary.totalEmissions).toBe(0);
    expect(dashboard.inclusionPolicy).toBe("approved_only");
    expect(dashboard.summary.carbonIntensity).toBeNull();
    expect(dashboard.summary.carbonIntensityUnit).toBe("Not available");
    expect(dashboard.dataQuality.issues).toEqual([]);
  });

  test("excludes draft-only records from approved emissions and explains why", () => {
    const dashboard = buildDashboardPayload({
      records: [record({ dataStatus: "draft", amountTonnes: 2 })],
      inclusionPolicy: "approved_only",
    });

    expect(dashboard.summary.totalEmissions).toBe(0);
    expect(dashboard.summary.draftRecords).toBe(1);
    expect(dashboard.summary.excludedRecordsCount).toBe(1);
    expect(dashboard.dataQuality.issues.some((issue) => issue.type === "draft_records")).toBe(true);
    expect(dashboard.dataQuality.issues.some((issue) => issue.type === "excluded_records")).toBe(true);
  });

  test("includes approved records in emissions, scope, category, and monthly totals", () => {
    const dashboard = buildDashboardPayload({
      records: [record({ dataStatus: "approved", scope: 3, category: "Business travel", amountTonnes: 2.25 })],
      inclusionPolicy: "approved_only",
    });

    expect(dashboard.summary.totalEmissions).toBe(2.25);
    expect(dashboard.summary.scope3).toBe(2.25);
    expect(dashboard.categories[0]).toMatchObject({ name: "Business travel", value: 2.25, scope3: 2.25 });
    expect(dashboard.monthly.some((month) => month.emissions === 2.25)).toBe(true);
  });

  test("reports missing factors, sample factors, zero activity amount, and calculation errors", () => {
    const dashboard = buildDashboardPayload({
      records: [
        record({ factorValue: null }),
        record({ factorIsSample: true }),
        record({ activityAmount: 0 }),
        record({ amountTonnes: 0, activityAmount: 10, factorValue: 0.5 }),
      ],
      inclusionPolicy: "all_records",
    });

    expect(dashboard.missingFactorRecords).toBe(1);
    expect(dashboard.sampleFactorRecords).toBe(1);
    expect(dashboard.zeroAmountRecords).toBe(1);
    expect(dashboard.calculationErrorRecords).toBe(1);
    expect(dashboard.dataQuality.issues.map((issue) => issue.type)).toEqual(expect.arrayContaining([
      "missing_factors",
      "sample_factors",
      "zero_activity",
      "calculation_errors",
    ]));
  });

  test("does not invent a carbon intensity denominator when none is configured", () => {
    const dashboard = buildDashboardPayload({
      records: [record({ amountTonnes: 3 })],
      inclusionPolicy: "approved_only",
    });

    expect(dashboard.summary.carbonIntensity).toBeNull();
    expect(dashboard.summary.carbonIntensityUnit).toBe("Not available");
  });

  test("uses an explicit revenue carbon intensity label when revenue exists", () => {
    const dashboard = buildDashboardPayload({
      records: [record({ amountTonnes: 2 })],
      settings: { operationalMetrics: { revenueUsd: 1000 } },
      inclusionPolicy: "approved_only",
    });

    expect(dashboard.summary.carbonIntensity).toBe(2);
    expect(dashboard.summary.carbonIntensityUnit).toBe("kgCO2e/USD revenue");
  });
});
