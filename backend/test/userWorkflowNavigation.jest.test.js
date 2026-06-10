const EmissionFactorService = require("../services/emissionFactor.service");
const ImportWorkflowService = require("../services/importWorkflow.service");
const ApprovalsService = require("../services/approvals.service");
const EmissionRecordService = require("../services/emissionRecord.service");
const NavigationService = require("../services/navigation.service");
const AuditService = require("../services/audit.service");
const ShipmentService = require("../services/shipment.service");
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
    jest.spyOn(EmissionFactor, "find").mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) });
    jest.spyOn(AuditLog, "find").mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) });

    await ApprovalsService.list("company-1", { type: "all" });

    expect(EmissionRecord.find).toHaveBeenCalledWith({ companyId: "company-1", dataStatus: "submitted" });
    expect(SupplierEvidence.find).toHaveBeenCalledWith({ companyId: "company-1", status: { $in: ["submitted", "under_review"] } });
    expect(EmissionFactor.find).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-1", isCustom: true }));
    expect(AuditLog.find).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-1" }));
  });

  test("approval action denies users without action permission", async () => {
    await expect(ApprovalsService.approve("emission_record", "record-1", "company-1", { role: "data_entry" }))
      .rejects
      .toThrow(/Permission denied: emission:approve/);
  });

  test("emission approval updates real record service and audits action", async () => {
    jest.spyOn(EmissionRecord, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "64f000000000000000000002",
        companyId: "company-1",
        dataStatus: "submitted",
        category: "Stationary combustion",
        submittedBy: "user-1",
        createdAt: new Date(),
        submittedAt: new Date(),
        dataQualityWarnings: [],
      }),
    });
    jest.spyOn(EmissionRecordService, "updateStatus").mockResolvedValue({ id: "64f000000000000000000002", dataStatus: "approved" });
    jest.spyOn(AuditService, "log").mockResolvedValue({});

    await ApprovalsService.approve("emission_record", "64f000000000000000000002", "company-1", { id: "manager-1", role: "manager", email: "manager@example.com" }, { notes: "Reviewed factor source" });

    expect(EmissionRecordService.updateStatus).toHaveBeenCalledWith("company-1", "64f000000000000000000002", "approved", expect.objectContaining({ id: "manager-1" }), "Reviewed factor source");
    expect(AuditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: "approval_item_approved", companyId: "company-1" }));
  });

  test("rejection requires reason before source record lookup", async () => {
    const findOne = jest.spyOn(EmissionRecord, "findOne");

    await expect(ApprovalsService.reject("emission_record", "record-1", "company-1", { id: "manager-1", role: "manager" }, {}))
      .rejects
      .toThrow(/rejection reason is required/i);

    expect(findOne).not.toHaveBeenCalled();
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

  test("shipment preview validates rows and flags duplicates", async () => {
    jest.spyOn(AuditService, "log").mockResolvedValue({ _id: "preview-1" });
    jest.spyOn(ShipmentService, "calculateFields").mockResolvedValue({
      tCO2e: 0.12,
      calculationStatus: "estimated",
      emissionFactorType: "sample",
      dataQualityWarnings: ["Sample factor used."],
    });
    const csv = [
      "shipmentReference,origin,destination,mode,carrier,distanceKm,weightKg,cost,currency,shipmentDate",
      "SHP-1,New York,Chicago,ROAD,Carrier,1200,1000,1200,USD,2026-05-15",
      "SHP-1,,Chicago,SPACE,Carrier,-1,0,-4,USD,not-a-date",
    ].join("\n");

    const preview = await ImportWorkflowService.preview("shipment", csv, "company-1", { id: "user-1", email: "user@example.com" });

    expect(preview.validRows).toBe(1);
    expect(preview.invalidRows).toBe(1);
    expect(preview.duplicateRows).toBe(2);
    expect(preview.rows[1].errors).toEqual(expect.arrayContaining(["origin is required"]));
  });

  test("supplier preview validates email and score ranges", async () => {
    jest.spyOn(AuditService, "log").mockResolvedValue({ _id: "preview-1" });
    const csv = [
      "name,contactEmail,country,region,category,totalEmissions,revenueOrActivityBase,transparencyScore,complianceProxy,verificationStatus,notes",
      "Bad Supplier,not-email,US,NA,Logistics,-1,100,200,75,self_reported,",
    ].join("\n");

    const preview = await ImportWorkflowService.preview("supplier", csv, "company-1", { id: "user-1" });

    expect(preview.validRows).toBe(0);
    expect(preview.rowErrors.map((row) => row.message).join(" ")).toMatch(/valid email|totalEmissions|between 0 and 100/);
  });

  test("error report is company scoped and protects CSV formula injection", async () => {
    jest.spyOn(AuditLog, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "64f000000000000000000001",
        companyId: "company-1",
        entityId: "import-1",
        action: "import_previewed",
        createdAt: new Date(),
        details: {
          importType: "supplier",
          fileName: "bad.csv",
          status: "previewed",
          totalRows: 1,
          invalidRows: 1,
          rows: [{ rowNumber: 2, valid: false, errors: ["=HYPERLINK(\"http://bad\")"], warnings: [] }],
        },
      }),
    });
    jest.spyOn(AuditService, "log").mockResolvedValue({});

    const report = await ImportWorkflowService.errorReport("company-1", "64f000000000000000000001", { id: "user-1" });

    expect(AuditLog.findOne).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-1" }));
    expect(report.content).toContain("'=HYPERLINK");
    expect(AuditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: "import_error_report_downloaded" }));
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
