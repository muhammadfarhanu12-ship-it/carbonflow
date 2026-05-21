const mockSupplierFind = jest.fn();
const mockSupplierFindOne = jest.fn();
const mockSupplierUpdateOne = jest.fn();
const mockEvidenceFind = jest.fn();
const mockEvidenceUpdateOne = jest.fn();
const mockAuditLog = jest.fn();
const mockIsMailerConfigured = jest.fn();
const mockSendEmail = jest.fn();

jest.mock("../models", () => ({
  Supplier: {
    find: (...args) => mockSupplierFind(...args),
    findOne: (...args) => mockSupplierFindOne(...args),
    updateOne: (...args) => mockSupplierUpdateOne(...args),
  },
  SupplierEvidence: {
    find: (...args) => mockEvidenceFind(...args),
    updateOne: (...args) => mockEvidenceUpdateOne(...args),
  },
}));

jest.mock("../services/audit.service", () => ({
  log: (...args) => mockAuditLog(...args),
}));

jest.mock("../utils/mailer", () => ({
  isMailerConfigured: (...args) => mockIsMailerConfigured(...args),
  sendEmail: (...args) => mockSendEmail(...args),
}));

const SupplierScheduledJobsService = require("../services/supplierScheduledJobs.service");

function leanResult(rows) {
  return {
    lean: jest.fn(async () => rows),
  };
}

describe("SupplierScheduledJobsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuditLog.mockResolvedValue(null);
    mockEvidenceUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mockSupplierUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mockSupplierFindOne.mockReturnValue({ lean: jest.fn(async () => ({ _id: "supplier-1", companyId: "company-1", name: "Supplier", contactEmail: "supplier@example.com" })) });
  });

  test("detects expiring soon and expired evidence plus overdue questionnaires", async () => {
    const now = new Date("2026-05-21T00:00:00Z");
    mockEvidenceFind
      .mockReturnValueOnce(leanResult([{ _id: "e7", expiresAt: new Date("2026-05-26T00:00:00Z") }]))
      .mockReturnValueOnce(leanResult([{ _id: "e30", expiresAt: new Date("2026-06-10T00:00:00Z") }]))
      .mockReturnValueOnce(leanResult([{ _id: "expired", expiresAt: new Date("2026-05-01T00:00:00Z") }]));
    mockSupplierFind.mockReturnValueOnce(leanResult([{ _id: "supplier-1", questionnaireDueDate: new Date("2026-05-01T00:00:00Z") }]));

    const result = await SupplierScheduledJobsService.detect({ now });

    expect(result.expiring7).toHaveLength(1);
    expect(result.expiring30).toHaveLength(1);
    expect(result.expired).toHaveLength(1);
    expect(result.overdueQuestionnaires).toHaveLength(1);
  });

  test("marks expired evidence and overdue questionnaires", async () => {
    const now = new Date("2026-05-21T00:00:00Z");
    mockIsMailerConfigured.mockReturnValue(false);
    mockEvidenceFind
      .mockReturnValueOnce(leanResult([]))
      .mockReturnValueOnce(leanResult([]))
      .mockReturnValueOnce(leanResult([{ _id: "e1", companyId: "company-1", supplierId: "supplier-1", title: "GHG", status: "verified", expiresAt: new Date("2026-05-01T00:00:00Z") }]));
    mockSupplierFind.mockReturnValueOnce(leanResult([{ _id: "supplier-1", companyId: "company-1", name: "Supplier", contactEmail: "supplier@example.com", questionnaireStatus: "sent", invitationStatus: "sent", questionnaireDueDate: new Date("2026-05-01T00:00:00Z") }]));

    const result = await SupplierScheduledJobsService.runEvidenceExpiryJob({ now });

    expect(result.expiredEvidence).toBe(1);
    expect(result.overdueQuestionnaires).toBe(1);
    expect(mockEvidenceUpdateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: "e1", companyId: "company-1" }), expect.objectContaining({ status: "expired" }));
    expect(mockSupplierUpdateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: "supplier-1", companyId: "company-1" }), expect.objectContaining({ questionnaireStatus: "overdue" }));
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "evidence_marked_expired" }));
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "questionnaire_marked_overdue" }));
  });

  test("sends reminder email when configured", async () => {
    const now = new Date("2026-05-21T00:00:00Z");
    mockIsMailerConfigured.mockReturnValue(true);
    mockSendEmail.mockResolvedValue({ messageId: "msg-1" });
    mockEvidenceFind
      .mockReturnValueOnce(leanResult([{ _id: "e7", companyId: "company-1", supplierId: "supplier-1", title: "ISO", expiresAt: new Date("2026-05-26T00:00:00Z") }]))
      .mockReturnValueOnce(leanResult([]))
      .mockReturnValueOnce(leanResult([]));
    mockSupplierFind.mockReturnValueOnce(leanResult([]));

    const result = await SupplierScheduledJobsService.runEvidenceExpiryJob({ now });

    expect(result.reminderEmailsSent).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "supplier@example.com" }));
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "reminder_email_sent" }));
  });

  test("logs reminder failure when email is not configured", async () => {
    const now = new Date("2026-05-21T00:00:00Z");
    mockIsMailerConfigured.mockReturnValue(false);
    mockEvidenceFind
      .mockReturnValueOnce(leanResult([{ _id: "e7", companyId: "company-1", supplierId: "supplier-1", title: "ISO", expiresAt: new Date("2026-05-26T00:00:00Z") }]))
      .mockReturnValueOnce(leanResult([]))
      .mockReturnValueOnce(leanResult([]));
    mockSupplierFind.mockReturnValueOnce(leanResult([]));

    const result = await SupplierScheduledJobsService.runEvidenceExpiryJob({ now });

    expect(result.reminderEmailsFailed).toBe(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "reminder_email_failed",
      details: expect.objectContaining({ reason: "email_provider_not_configured" }),
    }));
  });
});
