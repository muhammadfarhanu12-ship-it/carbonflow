const EmissionFactorService = require("../services/emissionFactor.service");
const ImportWorkflowService = require("../services/importWorkflow.service");
const ApprovalsService = require("../services/approvals.service");
const NavigationService = require("../services/navigation.service");
const AuditService = require("../services/audit.service");
const { EmissionFactor, AuditLog, EmissionRecord, SupplierEvidence, MarketplaceBudgetRequest, OffsetTransaction, Report } = require("../models");

describe("user-side enterprise workflow endpoints", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("factor library is company scoped and includes global factors", async () => {
    jest.spyOn(EmissionFactor, "find").mockReturnValue({
      sort: jest.fn().mockReturnValue({ skip: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) }),
    });
    jest.spyOn(EmissionFactor, "countDocuments").mockResolvedValue(0);

    await EmissionFactorService.listForCompany("company-1", {});

    expect(EmissionFactor.find).toHaveBeenCalledWith(expect.objectContaining({
      $or: [{ companyId: "company-1" }, { companyId: null }, { companyId: "" }],
    }));
  });

  test("import history is company scoped", async () => {
    jest.spyOn(AuditLog, "find").mockReturnValue({
      sort: jest.fn().mockReturnValue({ skip: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) }),
    });
    jest.spyOn(AuditLog, "countDocuments").mockResolvedValue(0);

    await ImportWorkflowService.list("company-1", {});

    expect(AuditLog.find).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-1" }));
  });

  test("approval queue is company scoped", async () => {
    jest.spyOn(EmissionRecord, "find").mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) });
    jest.spyOn(SupplierEvidence, "find").mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) });
    jest.spyOn(MarketplaceBudgetRequest, "find").mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) });
    jest.spyOn(OffsetTransaction, "find").mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) });

    await ApprovalsService.list("company-1", { type: "all" });

    expect(EmissionRecord.find).toHaveBeenCalledWith({ companyId: "company-1", dataStatus: "submitted" });
    expect(SupplierEvidence.find).toHaveBeenCalledWith({ companyId: "company-1", status: { $in: ["submitted", "under_review"] } });
  });

  test("approval action denies users without action permission", async () => {
    await expect(ApprovalsService.approve("emission_record", "record-1", "company-1", { role: "data_entry" }))
      .rejects
      .toThrow(/Permission denied: emission:approve/);
  });

  test("import preview writes audit log", async () => {
    jest.spyOn(EmissionFactor, "find").mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    jest.spyOn(AuditService, "log").mockResolvedValue({});
    const csv = [
      "scope,category,activityType,factorKey,activityUnit,factorValue,factorUnit,sourceName,sourceYear,sourceUrl,country,region,version,effectiveFrom,effectiveTo,isOfficial,isCustom",
      "1,Stationary combustion,stationary_fuel,DIESEL,liter,2.68,kgCO2e/liter,Custom source,2025,,GLOBAL,GLOBAL,v1,,,false,true",
    ].join("\n");

    await ImportWorkflowService.preview("emission_factor", csv, "company-1", { id: "user-1", role: "admin", email: "admin@example.com" });

    expect(AuditService.log).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-1",
      action: "import_previewed",
    }));
  });

  test("navigation summary is company scoped", async () => {
    jest.spyOn(ApprovalsService, "summary").mockResolvedValue({ totalPending: 2 });
    jest.spyOn(AuditLog, "countDocuments").mockResolvedValue(0);
    jest.spyOn(EmissionRecord, "countDocuments").mockResolvedValue(1);
    jest.spyOn(Report, "countDocuments").mockResolvedValue(0);

    const summary = await NavigationService.summary("company-1");

    expect(summary.pendingApprovals).toBe(2);
    expect(EmissionRecord.countDocuments).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-1" }));
  });
});
