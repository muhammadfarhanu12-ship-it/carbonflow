const ReportsService = require("../services/reports.service");
const AuditService = require("../services/audit.service");
const { Report } = require("../models");

function buildDataset() {
  return {
    settings: { companyName: "Acme Carbon" },
    dashboard: {
      summary: {
        totalEmissions: 1.2,
        scope1: 0.3,
        scope2: 0.4,
        scope3: 0.5,
        totalCost: 100,
        highRiskSuppliers: 1,
        totalOffsets: 2,
        dataCompletenessPct: 75,
        activitiesRecorded: 3,
        reportsGenerated: 1,
      },
      scopeBreakdown: [
        { name: "Scope 1", value: 0.3, percentage: 25 },
        { name: "Scope 2", value: 0.4, percentage: 33.33 },
        { name: "Scope 3", value: 0.5, percentage: 41.67 },
      ],
      categories: [{ name: "Business travel", scope1: 0, scope2: 0, scope3: 0.5, value: 0.5 }],
      monthly: [{ name: "May 26", scope1: 0.3, scope2: 0.4, scope3: 0.5, emissions: 1.2, cost: 100 }],
      dataQuality: {
        completedSignals: 4,
        requiredSignals: 6,
        sampleFactorRecords: 1,
        missingFactorRecords: 0,
        status: "PARTIAL",
      },
    },
    emissionRecords: [{
      occurredAt: new Date("2026-05-18T00:00:00.000Z"),
      reportingPeriod: "2026-05",
      scope: 3,
      category: "Business travel",
      activityAmount: 1500,
      activityUnit: "km",
      factorValue: 0.156,
      factorUnit: "kgCO2e/km",
      factorSource: "CarbonFlow sample factors",
      factorSourceYear: 2026,
      factorRegion: "GLOBAL",
      factorCountry: null,
      factorIsSample: true,
      activityData: { calculationFormula: "emissions = activityAmount x emissionFactor" },
      emissionsKgCo2e: 234,
      emissionsTCo2e: 0.234,
    }],
    shipments: [],
    suppliers: [],
    offsetTransactions: [],
    recordSelection: "approved_only",
  };
}

describe("ReportsService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("CSV report includes enterprise report sections and sample factor disclaimer", () => {
    const csv = ReportsService.buildCsv({
      name: "Enterprise Carbon Report",
      type: "ESG",
      format: "CSV",
      generatedAt: new Date("2026-05-18T00:00:00.000Z"),
      metadata: { reportingPeriod: "2026-05" },
    }, buildDataset());

    expect(csv).toContain("Acme Carbon");
    expect(csv).toContain("Reporting Period");
    expect(csv).toContain("Emission Activity Calculation Detail");
    expect(csv).toContain("This MVP uses sample emission factors. Replace with official factors before production use.");
    expect(csv).toContain("emissions = activityAmount x emissionFactor");
  });

  test("rejects invalid report generation payload before database write", async () => {
    await expect(ReportsService.generate({ name: "", type: "BAD", format: "TXT" }, "company-1"))
      .rejects
      .toThrow(/Report name, valid type, and valid format are required/);
  });

  test("defaults generated reports to approved records only", async () => {
    const createSpy = jest.spyOn(Report, "create").mockImplementation(async (payload) => ({ id: "report-1", ...payload }));
    jest.spyOn(AuditService, "log").mockResolvedValue({});

    const report = await ReportsService.generate({
      name: "Enterprise Carbon Report",
      type: "ESG",
      format: "PDF",
    }, "company-1", { id: "manager-1", email: "manager@example.com" });

    expect(report.metadata.approvedOnly).toBe(true);
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ approvedOnly: true }),
    }));
  });

  test("defaults generated report format to PDF", async () => {
    const createSpy = jest.spyOn(Report, "create").mockImplementation(async (payload) => ({ id: "report-1", ...payload }));
    jest.spyOn(AuditService, "log").mockResolvedValue({});

    const report = await ReportsService.generate({
      name: "Default Format Report",
      type: "ESG",
    }, "company-1", { id: "manager-1", email: "manager@example.com" });

    expect(report.format).toBe("PDF");
    expect(report.downloadUrl).toMatch(/\.pdf$/);
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
      format: "PDF",
      downloadUrl: expect.stringMatching(/\.pdf$/),
    }));
  });

  test("CSV report warns when all records are included", () => {
    const csv = ReportsService.buildCsv({
      name: "Draft Carbon Report",
      type: "CUSTOM",
      format: "CSV",
      generatedAt: new Date("2026-05-18T00:00:00.000Z"),
      metadata: { includeUnapproved: true, approvedOnly: false },
    }, { ...buildDataset(), recordSelection: "all_records" });

    expect(csv).toContain("All records");
    expect(csv).toContain("This report includes unapproved records");
  });
});
