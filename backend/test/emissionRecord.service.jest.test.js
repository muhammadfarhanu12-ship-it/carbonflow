const EmissionRecordService = require("../services/emissionRecord.service");
const AuditService = require("../services/audit.service");
const { EmissionRecord, Supplier, AuditLog, LedgerEntry, Report, EmissionFactor } = require("../models");

describe("EmissionRecordService validation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("rejects invalid activity input", () => {
    expect(() => EmissionRecordService.validateActivityPayload({
      scope: 4,
      category: "",
      activityType: "",
      activityAmount: -1,
      activityUnit: "",
    })).toThrow(/scope must be 1, 2, or 3/);
  });

  test("rejects missing factor when no fallback or provided factor value exists", async () => {
    jest.spyOn(EmissionRecordService, "resolveActivityFactor").mockResolvedValue(null);

    await expect(EmissionRecordService.createActivity("company-1", {
      scope: 3,
      category: "Unknown category",
      activityType: "unknown_activity",
      activityAmount: 10,
      activityUnit: "mystery-unit",
      factorKey: "UNKNOWN",
      reportingPeriod: "2026-05",
      occurredAt: "2026-05-15",
      dataStatus: "submitted",
    }, { id: "user-1", email: "user@example.com" })).rejects.toThrow(/No emission factor found/);
  });

  test("allows draft save with missing factor and marks calculation status", async () => {
    jest.spyOn(EmissionRecordService, "resolveActivityFactor").mockResolvedValue(null);
    const upsertSpy = jest.spyOn(EmissionRecordService, "upsertRecord").mockResolvedValue({ id: "draft-1" });
    jest.spyOn(AuditService, "log").mockResolvedValue({});

    await EmissionRecordService.createActivity("company-1", {
      scope: 3,
      category: "Unknown category",
      activityType: "unknown_activity",
      activityAmount: 10,
      activityUnit: "mystery-unit",
      factorKey: "UNKNOWN",
      reportingPeriod: "2026-05",
      occurredAt: "2026-05-15",
      dataStatus: "draft",
    }, { id: "user-1", email: "user@example.com" });

    expect(upsertSpy).toHaveBeenCalledWith("company-1", expect.any(String), expect.objectContaining({
      dataStatus: "draft",
      calculationStatus: "draft_incomplete",
      factorSource: null,
    }));
  });

  test("updates data status and writes audit log", async () => {
    const record = {
      id: "record-1",
      dataStatus: "submitted",
      approvalNotes: null,
      save: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(EmissionRecord, "findOne").mockResolvedValue(record);
    const auditSpy = jest.spyOn(AuditService, "log").mockResolvedValue({});

    const updated = await EmissionRecordService.updateStatus("company-1", "record-1", "approved", { id: "manager-1", email: "manager@example.com", role: "manager" }, "Looks good");

    expect(updated.dataStatus).toBe("approved");
    expect(updated.approvedBy).toBe("manager-1");
    expect(updated.approvalNotes).toBe("Looks good");
    expect(record.save).toHaveBeenCalled();
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: "emission_record_approved",
      oldValue: expect.objectContaining({ dataStatus: "submitted" }),
      newValue: expect.objectContaining({ dataStatus: "approved" }),
    }));
  });

  test("allows a data entry user to submit a draft record", async () => {
    const record = {
      id: "record-2",
      dataStatus: "draft",
      save: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(EmissionRecord, "findOne").mockResolvedValue(record);
    jest.spyOn(AuditService, "log").mockResolvedValue({});

    const updated = await EmissionRecordService.updateStatus("company-1", "record-2", "submitted", { id: "entry-1", email: "entry@example.com", role: "data_entry" });

    expect(updated.dataStatus).toBe("submitted");
    expect(updated.submittedBy).toBe("entry-1");
    expect(updated.submittedAt).toBeInstanceOf(Date);
  });

  test("blocks invalid transition from draft directly to approved", async () => {
    const record = {
      id: "record-3",
      dataStatus: "draft",
      save: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(EmissionRecord, "findOne").mockResolvedValue(record);

    await expect(EmissionRecordService.updateStatus("company-1", "record-3", "approved", { id: "manager-1", role: "manager" }))
      .rejects
      .toThrow(/cannot change emission record status from draft to approved/);
    expect(record.save).not.toHaveBeenCalled();
  });

  test("blocks data entry users from approving records", async () => {
    const record = {
      id: "record-4",
      dataStatus: "submitted",
      save: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(EmissionRecord, "findOne").mockResolvedValue(record);

    await expect(EmissionRecordService.updateStatus("company-1", "record-4", "approved", { id: "entry-1", role: "data_entry" }))
      .rejects
      .toThrow(/cannot change emission record status/);
  });

  test("requires notes when requesting correction", async () => {
    const record = {
      id: "record-5",
      dataStatus: "submitted",
      save: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(EmissionRecord, "findOne").mockResolvedValue(record);

    await expect(EmissionRecordService.updateStatus("company-1", "record-5", "needs_correction", { id: "manager-1", role: "manager" }))
      .rejects
      .toThrow(/Notes are required/);
  });

  test("rejects supplierId from another company before creating record", async () => {
    jest.spyOn(Supplier, "findOne").mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });

    await expect(EmissionRecordService.createActivity("company-1", {
      scope: 3,
      category: "Purchased goods and services",
      activityType: "purchased_goods_services",
      activityAmount: 100,
      activityUnit: "USD",
      factorKey: "PURCHASED_GOODS_USD",
      supplierId: "supplier-other-company",
      reportingPeriod: "2026-05",
      occurredAt: "2026-05-15",
    }, { id: "user-1", email: "user@example.com" })).rejects.toThrow(/Supplier not found for this company/);
  });

  test("stores linked supplier id and supplier snapshot on created activities", async () => {
    jest.spyOn(Supplier, "findOne").mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: "supplier-1",
          name: "Acme Fuels",
          category: "Fuel",
          country: "US",
          riskLevel: "MEDIUM",
        }),
      }),
    });
    jest.spyOn(EmissionRecordService, "resolveActivityFactor").mockResolvedValue({
      id: "factor-1",
      factorValue: 0.25,
      factorUnit: "kgCO2e/USD",
      sourceName: "Company factor",
      sourceYear: 2026,
      region: "GLOBAL",
      isSample: false,
    });
    const upsertSpy = jest.spyOn(EmissionRecordService, "upsertRecord").mockResolvedValue({ id: "record-1" });
    jest.spyOn(AuditService, "log").mockResolvedValue({});

    await EmissionRecordService.createActivity("company-1", {
      scope: 3,
      category: "Purchased goods and services",
      activityType: "purchased_goods_services",
      activityAmount: 100,
      activityUnit: "USD",
      factorKey: "PURCHASED_GOODS_USD",
      supplierId: "supplier-1",
      reportingPeriod: "2026-05",
      occurredAt: "2026-05-15",
    }, { id: "user-1", email: "user@example.com" });

    expect(upsertSpy).toHaveBeenCalledWith("company-1", expect.any(String), expect.objectContaining({
      supplierId: "supplier-1",
      activityData: expect.objectContaining({
        supplierName: "Acme Fuels",
        supplierRiskLevel: "MEDIUM",
      }),
    }));
  });

  test("approved record edit requires reason", async () => {
    jest.spyOn(EmissionRecord, "findOne").mockResolvedValue({
      id: "record-approved",
      companyId: "company-1",
      dataStatus: "approved",
      createdBy: "user-1",
      activityData: { activityType: "stationary_fuel" },
      metadata: { factorKey: "DIESEL" },
    });

    await expect(EmissionRecordService.updateActivity("company-1", "record-approved", {
      activityAmount: 5,
    }, { id: "manager-1", role: "manager" })).rejects.toThrow(/editReason is required/);
  });

  test("draft edit recalculates emissions and writes old/new audit values", async () => {
    const record = {
      id: "record-draft",
      companyId: "company-1",
      dataStatus: "draft",
      scope: 1,
      category: "Stationary combustion",
      activityAmount: 1,
      activityUnit: "liter",
      factorCountry: "US",
      factorRegion: "GLOBAL",
      occurredAt: new Date("2026-05-15"),
      activityData: { activityType: "stationary_fuel", fuelType: "DIESEL" },
      metadata: { factorKey: "DIESEL" },
      toObject: () => ({
        id: "record-draft",
        dataStatus: "draft",
        activityAmount: 1,
        emissionsTCo2e: 0.001,
        metadata: { factorKey: "DIESEL" },
      }),
      save: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(EmissionRecord, "findOne").mockResolvedValue(record);
    jest.spyOn(EmissionRecordService, "resolveActivityFactor").mockResolvedValue({
      id: "factor-1",
      factorValue: 2,
      factorUnit: "kgCO2e/liter",
      activityUnit: "liter",
      sourceName: "Company factor",
      sourceYear: 2026,
      version: "v2",
      isSample: false,
      companyId: "company-1",
    });
    const auditSpy = jest.spyOn(AuditService, "log").mockResolvedValue({});

    const updated = await EmissionRecordService.updateActivity("company-1", "record-draft", {
      activityAmount: 10,
      activityUnit: "liter",
      category: "Stationary combustion",
      activityType: "stationary_fuel",
      factorKey: "DIESEL",
      occurredAt: "2026-05-15",
      reportingPeriod: "2026-05",
    }, { id: "user-1", role: "data_entry", email: "user@example.com" });

    expect(updated.emissionsKgCo2e).toBe(20);
    expect(updated.emissionsTCo2e).toBe(0.02);
    expect(record.save).toHaveBeenCalled();
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: "emission_record_updated",
      oldValue: expect.objectContaining({ activityAmount: 1 }),
      newValue: expect.objectContaining({ activityAmount: 10 }),
    }));
  });

  test("audit timeline returns same-company record, financial, and report events", async () => {
    jest.spyOn(EmissionRecord, "findOne").mockReturnValue({ lean: jest.fn().mockResolvedValue({ id: "record-1", companyId: "company-1" }) });
    jest.spyOn(AuditLog, "find").mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ id: "log-1", action: "emission_record_created", entityId: "record-1", createdAt: new Date("2026-05-01"), userEmail: "a@example.com", newValue: { dataStatus: "draft" } }]),
      }),
    });
    jest.spyOn(LedgerEntry, "find").mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ id: "entry-1", emissionRecordId: "record-1", createdAt: new Date("2026-05-02"), description: "Tax", totalCostUsd: 10 }]),
      }),
    });
    jest.spyOn(Report, "find").mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ id: "report-1", name: "Ledger Report", generatedAt: new Date("2026-05-03"), metadata: { generatedFrom: "carbon_ledger" } }]),
        }),
      }),
    });

    const timeline = await EmissionRecordService.getAuditTimeline("company-1", "record-1", { role: "auditor" });

    expect(AuditLog.find).toHaveBeenCalledWith({ companyId: "company-1", entityType: "EmissionRecord", entityId: "record-1" });
    expect(timeline.map((item) => item.action)).toEqual([
      "emission_record_created",
      "financial_entry_linked",
      "report_generated_including_record",
    ]);
  });

  test("detects stale factor when stored factor is inactive and newer factor exists", async () => {
    jest.spyOn(EmissionFactor, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue({ id: "old-factor", isActive: false, factorValue: 1, version: "v1" }),
    });
    jest.spyOn(EmissionRecordService, "resolveActivityFactor").mockResolvedValue({
      id: "new-factor",
      factorValue: 2,
      factorUnit: "kgCO2e/liter",
      sourceName: "Company factor",
      sourceYear: 2026,
      version: "v2",
      isSample: false,
    });

    const governance = await EmissionRecordService.buildFactorGovernance({
      emissionFactorId: "old-factor",
      scope: 1,
      category: "Stationary combustion",
      activityUnit: "liter",
      factorValueUsed: 1,
      factorVersion: "v1",
      activityData: { activityType: "stationary_fuel", fuelType: "DIESEL" },
      metadata: { factorKey: "DIESEL" },
    }, "company-1");

    expect(governance.factorStillActive).toBe(false);
    expect(governance.isStaleFactor).toBe(true);
    expect(governance.latestAvailableFactorId).toBe("new-factor");
  });
});
