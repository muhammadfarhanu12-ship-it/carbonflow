const backfill = require("../scripts/backfill-emission-record-snapshots");
const smoke = require("../scripts/smoke-carbon-ledger");
const EmissionRecordService = require("../services/emissionRecord.service");

describe("Carbon Ledger operational scripts", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("backfill defaults to dry-run and parses apply/company options", () => {
    expect(backfill.parseArgs([])).toEqual({ apply: false, force: false, companyId: null });
    expect(backfill.parseArgs(["--apply", "--force", "--companyId=company-1"])).toEqual({
      apply: true,
      force: true,
      companyId: "company-1",
    });
  });

  test("backfill marks missing factor records for manual review", async () => {
    jest.spyOn(EmissionRecordService, "resolveActivityFactor").mockResolvedValue(null);
    const result = await backfill.buildBackfill({
      companyId: "company-1",
      scope: 3,
      category: "Unknown",
      activityAmount: 10,
      activityUnit: "unit",
      activityData: { activityType: "unknown", fuelType: "UNKNOWN" },
      metadata: { factorKey: "UNKNOWN" },
      occurredAt: new Date("2026-05-01"),
    });

    expect(result.missingFactor).toBe(true);
    expect(result.manualReview).toContain("missing_factor");
    expect(result.updates.calculationStatus).toBe("missing_factor");
  });

  test("backfill rebuckets records by reporting period start instead of activity date", async () => {
    jest.spyOn(EmissionRecordService, "resolveActivityFactor").mockResolvedValue(null);
    const result = await backfill.buildBackfill({
      companyId: "company-1",
      scope: 1,
      category: "Stationary combustion",
      activityAmount: 10,
      activityUnit: "liter",
      activityData: { activityType: "stationary_fuel", fuelType: "DIESEL" },
      metadata: { factorKey: "DIESEL" },
      occurredAt: new Date("2026-05-28T00:00:00.000Z"),
      reportingPeriodStart: new Date("2026-06-01T00:00:00.000Z"),
      periodMonth: 5,
      periodYear: 2026,
    });

    expect(result.updates.periodMonth).toBe(6);
    expect(result.updates.periodYear).toBe(2026);
  });

  test("smoke script mutating mode requires explicit credentials", () => {
    expect(() => smoke.readConfig({ SMOKE_RUN_MUTATING_TESTS: "true" })).toThrow(/SMOKE_TEST_EMAIL/);
  });

  test("smoke script non-mutating mode does not require credentials", () => {
    expect(smoke.readConfig({}).mutating).toBe(false);
  });
});
