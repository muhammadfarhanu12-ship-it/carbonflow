const AuditService = require("../services/audit.service");
const EmissionRecordService = require("../services/emissionRecord.service");
const EmissionFactorService = require("../services/emissionFactor.service");
const { hasPermission } = require("../middlewares/rbac");
const { AuditLog, EmissionFactor, EmissionRecord } = require("../models");

describe("enterprise audit logs", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("audit log is created on emission record creation", async () => {
    jest.spyOn(EmissionRecordService, "resolveActivityFactor").mockResolvedValue({
      id: "factor-1",
      name: "Sample diesel",
      factorValue: 2.68,
      activityUnit: "liter",
      factorUnit: "kgCO2e/liter",
      sourceName: "CarbonFlow sample factors",
      sourceYear: 2026,
      region: "GLOBAL",
      isSample: true,
    });
    jest.spyOn(EmissionRecordService, "upsertRecord").mockResolvedValue({
      id: "record-1",
      scope: 1,
      category: "Stationary combustion",
      amountTonnes: 0.268,
      toObject: () => ({ id: "record-1", scope: 1 }),
    });
    const auditSpy = jest.spyOn(AuditService, "log").mockResolvedValue({});

    await EmissionRecordService.createActivity("company-1", {
      scope: 1,
      category: "Stationary combustion",
      activityType: "stationary_fuel",
      activityAmount: 100,
      activityUnit: "liter",
      factorKey: "DIESEL",
      reportingPeriod: "2026-05-01/2026-05-31",
      activityDate: "2026-05-15",
    }, { id: "user-1", email: "user@example.com", ipAddress: "127.0.0.1", userAgent: "jest" });

    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: "emission_record_created",
      entityType: "EmissionRecord",
      entityId: "record-1",
      ipAddress: "127.0.0.1",
      userAgent: "jest",
    }));
  });

  test("audit log is created on approval", async () => {
    const record = {
      id: "record-2",
      dataStatus: "submitted",
      save: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(EmissionRecord, "findOne").mockResolvedValue(record);
    const auditSpy = jest.spyOn(AuditService, "log").mockResolvedValue({});

    await EmissionRecordService.updateStatus("company-1", "record-2", "approved", {
      id: "manager-1",
      email: "manager@example.com",
      role: "manager",
    }, "Approved");

    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: "emission_record_approved",
      entityType: "EmissionRecord",
      entityId: "record-2",
    }));
  });

  test("audit log is created on factor update", async () => {
    const factor = {
      id: "factor-1",
      companyId: "company-1",
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
        id: "factor-1",
        companyId: "company-1",
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

    await EmissionFactorService.update("factor-1", { name: "Updated factor" }, { id: "admin-1", role: "admin", companyId: "company-1" });

    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: "emission_factor_updated",
      entityType: "EmissionFactor",
      entityId: "factor-1",
      companyId: "company-1",
    }));
  });

  test("viewer cannot access audit logs and auditor can view audit logs", () => {
    expect(hasPermission({ role: "viewer" }, "audit:view")).toBe(false);
    expect(hasPermission({ role: "auditor" }, "audit:view")).toBe(true);
  });

  test("lists audit logs with supported filters", async () => {
    const rows = [{
      _id: "audit-1",
      companyId: "company-1",
      userId: "user-1",
      action: "emission_record_approved",
      entityType: "EmissionRecord",
      entityId: "record-1",
      createdAt: new Date("2026-05-19T00:00:00.000Z"),
    }];
    const limit = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(rows) });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    jest.spyOn(AuditLog, "find").mockReturnValue({ sort });
    jest.spyOn(AuditLog, "countDocuments").mockResolvedValue(1);

    const result = await AuditService.list("company-1", {
      action: "emission_record_approved",
      entityType: "EmissionRecord",
      userId: "user-1",
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });

    expect(AuditLog.find).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-1",
      action: "emission_record_approved",
      entityType: "EmissionRecord",
      userId: "user-1",
      createdAt: expect.objectContaining({
        $gte: expect.any(Date),
        $lte: expect.any(Date),
      }),
    }));
    expect(result.data[0].id).toBe("audit-1");
  });
});
