const EmissionRecordService = require("../services/emissionRecord.service");
const AuditService = require("../services/audit.service");
const { EmissionRecord } = require("../models");

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
    }, { id: "user-1", email: "user@example.com" })).rejects.toThrow(/No emission factor found/);
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
});
