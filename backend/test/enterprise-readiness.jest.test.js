const { hasPermission } = require("../middlewares/rbac");
const { requireAdminRole } = require("../modules/admin/middleware/adminAuthMiddleware");
const {
  isOfficialOrCustomFactor,
  selectBestMatchingFactor,
  validateFactorPayload,
} = require("../services/emissionFactor.service");
const EmissionFactorService = require("../services/emissionFactor.service");
const EmissionImportService = require("../services/emissionImport.service");
const EmissionRecordService = require("../services/emissionRecord.service");
const shipmentEmissionsController = require("../controllers/shipmentEmissions.controller");
const AuditService = require("../services/audit.service");
const { EmissionFactor } = require("../models");

describe("enterprise production readiness", () => {
  test("validates official/custom factors separately from sample factors", () => {
    const official = validateFactorPayload({
      name: "EPA electricity factor",
      scope: 2,
      category: "Purchased electricity",
      activityType: "electricity",
      activityUnit: "kWh",
      factorValue: 0.385,
      factorUnit: "kgCO2e/kWh",
      sourceName: "EPA",
      sourceYear: 2026,
      country: "US",
      region: "US",
      version: "2026.1",
      isSample: false,
    });

    expect(official.isSample).toBe(false);
    expect(official.sourceName).toBe("EPA");
    expect(isOfficialOrCustomFactor(official)).toBe(true);
    expect(isOfficialOrCustomFactor({ ...official, isSample: true })).toBe(false);
  });

  test("detects sample factors explicitly", () => {
    const sample = validateFactorPayload({
      name: "CarbonFlow sample electricity factor",
      scope: 2,
      category: "Purchased electricity",
      activityType: "electricity",
      activityUnit: "kWh",
      factorValue: 0.42,
      factorUnit: "kgCO2e/kWh",
      sourceName: "CarbonFlow sample factors",
      sourceYear: 2026,
      region: "GLOBAL",
      isSample: true,
    });

    expect(sample.isSample).toBe(true);
    expect(isOfficialOrCustomFactor(sample)).toBe(false);
  });

  test("selects company-specific active factor before global factor", () => {
    const criteria = {
      companyId: "company-1",
      scope: 2,
      category: "Purchased electricity",
      activityType: "electricity",
      activityUnit: "kWh",
      country: "US",
      region: "US",
      occurredAt: "2026-05-18",
    };
    const selected = selectBestMatchingFactor([
      {
        id: "global",
        companyId: null,
        scope: 2,
        category: "Purchased electricity",
        activityType: "electricity",
        activityUnit: "kWh",
        sourceYear: 2026,
        region: "US",
        country: "US",
        isActive: true,
        isSample: false,
        sourceName: "EPA",
      },
      {
        id: "custom",
        companyId: "company-1",
        scope: 2,
        category: "Purchased electricity",
        activityType: "electricity",
        activityUnit: "kWh",
        sourceYear: 2025,
        region: "US",
        country: "US",
        isActive: true,
        isSample: false,
        sourceName: "Company utility contract",
      },
    ], criteria);

    expect(selected.id).toBe("custom");
  });

  test("activity uses correct matching factor key", () => {
    const selected = selectBestMatchingFactor([
      {
        id: "petrol",
        scope: 1,
        category: "Stationary combustion",
        activityType: "stationary_fuel",
        factorKey: "PETROL",
        activityUnit: "liter",
        sourceYear: 2026,
        region: "GLOBAL",
        isActive: true,
        isSample: true,
        sourceName: "CarbonFlow Sample Factor",
      },
      {
        id: "diesel",
        scope: 1,
        category: "Stationary combustion",
        activityType: "stationary_fuel",
        factorKey: "DIESEL",
        activityUnit: "liter",
        sourceYear: 2026,
        region: "GLOBAL",
        isActive: true,
        isSample: false,
        sourceName: "Company fuel factor",
      },
    ], {
      scope: 1,
      category: "Stationary combustion",
      activityType: "stationary_fuel",
      factorKey: "DIESEL",
      activityUnit: "liter",
      region: "GLOBAL",
    });

    expect(selected.id).toBe("diesel");
  });

  test("resolves activity factor by factor key from active database factors", async () => {
    const factors = [
      {
        id: "petrol",
        scope: 1,
        category: "Stationary combustion",
        activityType: "stationary_fuel",
        factorKey: "PETROL",
        activityUnit: "liter",
        sourceYear: 2026,
        region: "GLOBAL",
        isActive: true,
        isSample: false,
        sourceName: "Company petrol factor",
      },
      {
        id: "diesel",
        scope: 1,
        category: "Stationary combustion",
        activityType: "stationary_fuel",
        factorKey: "DIESEL",
        activityUnit: "liter",
        sourceYear: 2026,
        region: "GLOBAL",
        isActive: true,
        isSample: false,
        sourceName: "Company diesel factor",
      },
    ];
    jest.spyOn(EmissionFactor, "find").mockReturnValue({
      lean: jest.fn().mockResolvedValue(factors),
    });

    const selected = await EmissionRecordService.resolveActivityFactor({
      companyId: "company-1",
      scope: 1,
      category: "Stationary combustion",
      activityType: "stationary_fuel",
      factorKey: "DIESEL",
      activityUnit: "liter",
      region: "GLOBAL",
    });

    expect(selected.id).toBe("diesel");
  });

  test("factor resolver scopes custom factors to requesting company or global factors", async () => {
    const findSpy = jest.spyOn(EmissionFactor, "find").mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });

    await EmissionRecordService.resolveActivityFactor({
      companyId: "company-a",
      scope: 1,
      category: "Stationary combustion",
      activityType: "stationary_fuel",
      factorKey: "DIESEL",
      activityUnit: "liter",
      region: "GLOBAL",
    });

    expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({
      $and: expect.arrayContaining([
        expect.objectContaining({
          $or: expect.arrayContaining([
            { companyId: "company-a" },
            { companyId: null },
            { companyId: "" },
          ]),
        }),
      ]),
    }));
  });

  test("does not select inactive factors", () => {
    const selected = selectBestMatchingFactor([
      {
        id: "inactive",
        scope: 3,
        category: "Business travel",
        activityType: "business_travel_air",
        activityUnit: "km",
        sourceYear: 2026,
        region: "GLOBAL",
        isActive: false,
        isSample: false,
        sourceName: "Official source",
      },
    ], {
      scope: 3,
      category: "Business travel",
      activityType: "business_travel_air",
      activityUnit: "km",
      region: "GLOBAL",
    });

    expect(selected).toBeNull();
  });

  test("selects latest active factor version", () => {
    const selected = selectBestMatchingFactor([
      {
        id: "older",
        scope: 1,
        category: "Stationary combustion",
        activityType: "stationary_fuel",
        activityUnit: "liter",
        sourceYear: 2024,
        version: "2024.1",
        region: "GLOBAL",
        isActive: true,
        isSample: false,
        sourceName: "Official source",
      },
      {
        id: "latest",
        scope: 1,
        category: "Stationary combustion",
        activityType: "stationary_fuel",
        activityUnit: "liter",
        sourceYear: 2026,
        version: "2026.2",
        region: "GLOBAL",
        isActive: true,
        isSample: false,
        sourceName: "Official source",
      },
    ], {
      scope: 1,
      category: "Stationary combustion",
      activityType: "stationary_fuel",
      activityUnit: "liter",
      region: "GLOBAL",
    });

    expect(selected.id).toBe("latest");
  });

  test("returns null when no factor matches", () => {
    const selected = selectBestMatchingFactor([], {
      scope: 1,
      category: "Stationary combustion",
      activityType: "stationary_fuel",
      activityUnit: "liter",
    });

    expect(selected).toBeNull();
  });

  test("deactivates factors instead of deleting and writes audit log", async () => {
    const factor = {
      id: "factor-1",
      isActive: true,
      updatedBy: null,
      toObject: () => ({ id: "factor-1", isActive: true }),
      save: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(EmissionFactor, "findById").mockResolvedValue(factor);
    const auditSpy = jest.spyOn(AuditService, "log").mockResolvedValue({});

    const result = await EmissionFactorService.deactivate("factor-1", { id: "admin-1", email: "admin@example.com" });

    expect(result.isActive).toBe(false);
    expect(factor.save).toHaveBeenCalled();
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: "emission_factor_deactivated",
      entityType: "EmissionFactor",
      entityId: "factor-1",
    }));
  });

  test("admin can create factor", async () => {
    const createdFactor = {
      id: "factor-created",
      toObject: () => ({ id: "factor-created", name: "Official electricity factor" }),
    };
    jest.spyOn(EmissionFactor, "create").mockResolvedValue(createdFactor);
    const auditSpy = jest.spyOn(AuditService, "log").mockResolvedValue({});

    const result = await EmissionFactorService.create({
      name: "Official electricity factor",
      scope: 2,
      category: "Purchased electricity",
      activityType: "electricity",
      activityUnit: "kWh",
      factorValue: 0.3,
      factorUnit: "kgCO2e/kWh",
      sourceName: "Official source",
      sourceYear: 2026,
      isSample: false,
    }, { id: "admin-1", email: "admin@example.com" });

    expect(result.id).toBe("factor-created");
    expect(EmissionFactor.create).toHaveBeenCalledWith(expect.objectContaining({
      createdBy: "admin-1",
      isSample: false,
    }));
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ action: "emission_factor_created" }));
  });

  test("admin can edit factor", async () => {
    const factor = {
      id: "factor-edit",
      name: "Old factor",
      scope: 2,
      category: "Purchased electricity",
      activityType: "electricity",
      activityUnit: "kWh",
      factorValue: 0.4,
      value: 0.4,
      unit: "kWh",
      factorUnit: "kgCO2e/kWh",
      sourceName: "Official source",
      sourceYear: 2025,
      isSample: false,
      toObject: () => ({
        id: "factor-edit",
        name: "Old factor",
        scope: 2,
        category: "Purchased electricity",
        activityType: "electricity",
        activityUnit: "kWh",
        factorValue: 0.4,
        value: 0.4,
        unit: "kWh",
        factorUnit: "kgCO2e/kWh",
        sourceName: "Official source",
        sourceYear: 2025,
        isSample: false,
      }),
      save: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(EmissionFactor, "findById").mockResolvedValue(factor);
    const auditSpy = jest.spyOn(AuditService, "log").mockResolvedValue({});

    const result = await EmissionFactorService.update("factor-edit", { name: "Updated factor", sourceYear: 2026 }, { id: "admin-1", email: "admin@example.com" });

    expect(result.name).toBe("Updated factor");
    expect(result.sourceYear).toBe(2026);
    expect(factor.save).toHaveBeenCalled();
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ action: "emission_factor_updated" }));
  });

  test("normal user cannot manage admin factors", () => {
    const middleware = requireAdminRole("owner", "superadmin", "admin");
    const req = { admin: undefined };
    const next = jest.fn();

    middleware(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test("CSV import preview returns row-level validation errors", async () => {
    jest.spyOn(EmissionRecordService, "resolveActivityFactor").mockResolvedValue(null);
    const preview = await EmissionImportService.preview("scope,category,activityType,activityAmount,activityUnit,reportingPeriodStart,reportingPeriodEnd,facility,businessUnit,country,notes\n4,,bad,-1,kg,not-a-date,2026-05-31,HQ,Ops,US,Bad row", "company-1");

    expect(preview.totalRows).toBe(1);
    expect(preview.validRows).toBe(0);
    expect(preview.rows[0].errors.length).toBeGreaterThan(0);
  });

  test("valid CSV preview returns matched factor and calculated emissions", async () => {
    jest.spyOn(EmissionRecordService, "resolveActivityFactor").mockResolvedValue({
      id: "factor-1",
      name: "CarbonFlow sample business travel",
      factorValue: 0.156,
      activityUnit: "km",
      factorUnit: "kgCO2e/km",
      sourceName: "CarbonFlow sample factors",
      sourceYear: 2026,
      region: "GLOBAL",
      isSample: true,
    });
    const preview = await EmissionImportService.preview("scope,category,activityType,activityAmount,activityUnit,reportingPeriodStart,reportingPeriodEnd,facility,businessUnit,country,notes\n3,Business travel,business_travel_air,1500,km,2026-05-01,2026-05-31,HQ,Sales,US,Flight travel", "company-1");

    expect(preview.validRows).toBe(1);
    expect(preview.rows[0].factor.isSample).toBe(true);
    expect(preview.rows[0].calculation.emissionsKgCo2e).toBe(234);
    expect(preview.rows[0].calculation.emissionsTCo2e).toBe(0.234);
  });

  test("CSV import preview reports missing factor row errors", async () => {
    jest.spyOn(EmissionRecordService, "resolveActivityFactor").mockResolvedValue(null);
    const preview = await EmissionImportService.preview("scope,category,activityType,activityAmount,activityUnit,reportingPeriodStart,reportingPeriodEnd,facility,businessUnit,country,notes\n3,Business travel,business_travel_air,1500,km,2026-05-01,2026-05-31,HQ,Sales,US,Flight travel", "company-1");

    expect(preview.validRows).toBe(0);
    expect(preview.invalidRows).toBe(1);
    expect(preview.rows[0].errors).toContain("No matching emission factor found");
  });

  test("CSV import commit saves only valid rows and returns records for ledger", async () => {
    jest.spyOn(EmissionRecordService, "resolveActivityFactor").mockResolvedValue({
      id: "factor-1",
      name: "CarbonFlow sample business travel",
      factorValue: 0.156,
      activityUnit: "km",
      factorUnit: "kgCO2e/km",
      sourceName: "CarbonFlow sample factors",
      sourceYear: 2026,
      region: "GLOBAL",
      isSample: true,
    });
    const createSpy = jest.spyOn(EmissionRecordService, "createActivity").mockResolvedValue({ id: "record-1", category: "Business travel" });
    const csv = [
      "scope,category,activityType,activityAmount,activityUnit,reportingPeriodStart,reportingPeriodEnd,facility,businessUnit,country,notes",
      "3,Business travel,business_travel_air,1500,km,2026-05-01,2026-05-31,HQ,Sales,US,Flight travel",
      "4,,bad,-1,kg,not-a-date,2026-05-31,HQ,Ops,US,Bad row",
    ].join("\n");

    const result = await EmissionImportService.commit(csv, "company-1", { id: "user-1", email: "user@example.com" });

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(result.createdCount).toBe(1);
    expect(result.createdRecords).toEqual([{ id: "record-1", category: "Business travel" }]);
  });

  test("import commit controller emits dashboard and ledger refresh events", async () => {
    jest.spyOn(EmissionImportService, "commit").mockResolvedValue({ createdCount: 1, rows: [], validRows: 1, invalidRows: 0 });
    jest.spyOn(AuditService, "logForRequest").mockResolvedValue({});
    const emit = jest.fn();
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    await shipmentEmissionsController.commitImport({
      body: { csv: "csv" },
      user: { companyId: "company-1", id: "user-1", email: "user@example.com" },
      io: { emit },
    }, { status, json });

    expect(emit).toHaveBeenCalledWith("emissionActivityCreated", expect.any(Object));
    expect(emit).toHaveBeenCalledWith("ledgerUpdated", expect.any(Object));
    expect(status).toHaveBeenCalledWith(201);
  });

  test("RBAC denies viewers from creating records and allows data entry", () => {
    expect(hasPermission({ role: "viewer" }, "records:create")).toBe(false);
    expect(hasPermission({ role: "viewer" }, "records:edit")).toBe(false);
    expect(hasPermission({ role: "viewer" }, "report:generate")).toBe(false);
    expect(hasPermission({ role: "auditor" }, "emission:update")).toBe(false);
    expect(hasPermission({ role: "auditor" }, "audit:view")).toBe(true);
    expect(hasPermission({ role: "data_entry" }, "records:create")).toBe(true);
  });
});
