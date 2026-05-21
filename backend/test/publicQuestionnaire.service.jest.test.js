const mockSupplierFindOne = jest.fn();
const mockCompanyFindById = jest.fn();
const mockUserFindOne = jest.fn();
const mockAuditLog = jest.fn();
const mockSyncSupplierRecord = jest.fn();
const mockEvidenceCreate = jest.fn();
const mockEvidenceUploadFile = jest.fn();
const mockIsMailerConfigured = jest.fn();
const mockSendEmail = jest.fn();
const mockSendSupplierQuestionnaireEmail = jest.fn();

jest.mock("../models", () => ({
  Company: {
    findById: (...args) => mockCompanyFindById(...args),
  },
  Supplier: {
    findOne: (...args) => mockSupplierFindOne(...args),
  },
  User: {
    findOne: (...args) => mockUserFindOne(...args),
  },
}));

jest.mock("../utils/mailer", () => ({
  isMailerConfigured: (...args) => mockIsMailerConfigured(...args),
  sendEmail: (...args) => mockSendEmail(...args),
}));

jest.mock("../services/emailService", () => ({
  sendSupplierQuestionnaireEmail: (...args) => mockSendSupplierQuestionnaireEmail(...args),
}));

jest.mock("../services/audit.service", () => ({
  log: (...args) => mockAuditLog(...args),
}));

jest.mock("../services/emissionRecord.service", () => ({
  syncSupplierRecord: (...args) => mockSyncSupplierRecord(...args),
}));

jest.mock("../services/supplierEvidence.service", () => ({
  SupplierEvidenceService: {
    create: (...args) => mockEvidenceCreate(...args),
    uploadFile: (...args) => mockEvidenceUploadFile(...args),
  },
}));

const {
  SupplierQuestionnaireService,
  generateQuestionnaireToken,
  hashToken,
} = require("../services/supplierQuestionnaire.service");

function createSupplier(overrides = {}) {
  const supplier = {
    _id: "supplier-1",
    id: "supplier-1",
    companyId: "company-1",
    name: "Test Supplier",
    contactEmail: "supplier@example.com",
    country: "US",
    region: "North America",
    category: "Manufacturing",
    status: "submitted",
    verificationStatus: "pending",
    invitationStatus: "sent",
    questionnaireStatus: "sent",
    questionnaireTokenHash: hashToken("valid-token"),
    questionnaireTokenExpiresAt: new Date(Date.now() + 86400000),
    questionnaireDueDate: new Date(Date.now() + 43200000),
    questionnaireReminderCount: 0,
    totalEmissions: 0,
    totalEmissionsTco2e: 0,
    revenue: null,
    revenueOrActivityBase: null,
    dataTransparencyScore: 80,
    complianceScore: 80,
    update: jest.fn(async function update(values) {
      Object.assign(supplier, values);
      return supplier;
    }),
    toJSON: jest.fn(function toJSON() {
      return { ...supplier };
    }),
    ...overrides,
  };
  return supplier;
}

function mockCompany(name = "Acme Corp") {
  mockCompanyFindById.mockReturnValue({
    lean: jest.fn(async () => ({ name })),
  });
}

describe("Public supplier questionnaire service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCompany();
    mockIsMailerConfigured.mockReturnValue(false);
    mockAuditLog.mockResolvedValue(null);
    mockSyncSupplierRecord.mockResolvedValue(null);
    mockEvidenceCreate.mockResolvedValue({ id: "evidence-1" });
    mockEvidenceUploadFile.mockResolvedValue({
      id: "evidence-upload-1",
      supplierId: "supplier-1",
      companyId: "company-1",
      fileName: "ghg.pdf",
      fileSize: 128,
      uploadedVia: "questionnaire",
    });
    mockUserFindOne.mockReturnValue({
      lean: jest.fn(async () => ({ email: "admin@example.com" })),
    });
  });

  test("generates and hashes secure questionnaire tokens", () => {
    const token = generateQuestionnaireToken();
    const hashed = hashToken(token);

    expect(token).toHaveLength(64);
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toBe(token);
  });

  test("rejects invalid tokens", async () => {
    mockSupplierFindOne.mockResolvedValue(null);

    await expect(SupplierQuestionnaireService.getPublicQuestionnaire("missing-token"))
      .rejects.toMatchObject({ statusCode: 404, message: "Questionnaire link is invalid." });
  });

  test("returns expired token state for GET", async () => {
    const supplier = createSupplier({
      questionnaireTokenExpiresAt: new Date(Date.now() - 1000),
    });
    mockSupplierFindOne.mockResolvedValue(supplier);

    const result = await SupplierQuestionnaireService.getPublicQuestionnaire("valid-token");

    expect(result.expired).toBe(true);
    expect(result.supplierName).toBe("Test Supplier");
    expect(result.requestingCompanyName).toBe("Acme Corp");
  });

  test("returns questionnaire context by token and marks it opened", async () => {
    const supplier = createSupplier();
    mockSupplierFindOne.mockResolvedValue(supplier);

    const result = await SupplierQuestionnaireService.getPublicQuestionnaire("valid-token");

    expect(result.status).toBe("opened");
    expect(result.requestedFields).toContain("Total emissions");
    expect(supplier.update).toHaveBeenCalledWith(expect.objectContaining({
      questionnaireStatus: "opened",
      invitationStatus: "opened",
    }));
  });

  test("submits questionnaire, updates supplier scoring fields, and creates audit log", async () => {
    const supplier = createSupplier();
    mockSupplierFindOne.mockResolvedValue(supplier);

    const result = await SupplierQuestionnaireService.submitPublicQuestionnaire("valid-token", {
      totalEmissions: 120,
      revenueOrActivityBase: 6000,
      reportingPeriod: "FY2025",
      verificationStatus: "self_reported",
      certifications: ["ISO 14001"],
      evidenceNotes: "GHG inventory available on request.",
      contactEmail: "contact@supplier.test",
    }, {
      ipAddress: "127.0.0.1",
      userAgent: "jest",
    });

    expect(result.status).toBe("submitted");
    expect(supplier.update).toHaveBeenCalledWith(expect.objectContaining({
      questionnaireStatus: "submitted",
      totalEmissions: 120,
      revenueOrActivityBase: 6000,
      riskLevel: expect.any(String),
      esgScore: expect.any(Number),
    }));
    expect(mockEvidenceCreate).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      evidenceType: "supplier_questionnaire_answers",
      status: "submitted",
    }), null);
    expect(mockSyncSupplierRecord).toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "questionnaire_status_changed",
      companyId: "company-1",
      details: expect.objectContaining({ source: "public_questionnaire" }),
    }));
  });

  test("rejects already submitted tokens", async () => {
    mockSupplierFindOne.mockResolvedValue(createSupplier({ questionnaireStatus: "submitted" }));

    await expect(SupplierQuestionnaireService.submitPublicQuestionnaire("valid-token", {
      totalEmissions: 120,
      revenueOrActivityBase: 6000,
      reportingPeriod: "FY2025",
      verificationStatus: "self_reported",
    })).rejects.toMatchObject({ statusCode: 409, message: "Questionnaire has already been submitted." });
  });

  test("rejects submissions with missing required fields", async () => {
    mockSupplierFindOne.mockResolvedValue(createSupplier());

    await expect(SupplierQuestionnaireService.submitPublicQuestionnaire("valid-token", {
      totalEmissions: 120,
    })).rejects.toMatchObject({
      statusCode: 422,
      details: expect.arrayContaining([
        expect.objectContaining({ field: "revenueOrActivityBase" }),
        expect.objectContaining({ field: "reportingPeriod" }),
      ]),
    });
  });

  test("uploads public questionnaire evidence for token supplier", async () => {
    const supplier = createSupplier();
    mockSupplierFindOne.mockResolvedValue(supplier);

    const result = await SupplierQuestionnaireService.uploadPublicEvidence("valid-token", {
      originalname: "ghg.pdf",
      size: 128,
      mimetype: "application/pdf",
      buffer: Buffer.from("pdf"),
    }, {
      evidenceType: "ghg_inventory",
    }, {
      ipAddress: "127.0.0.1",
    });

    expect(result.uploadedVia).toBe("questionnaire");
    expect(mockEvidenceUploadFile).toHaveBeenCalledWith(supplier, expect.any(Object), expect.objectContaining({
      evidenceType: "ghg_inventory",
    }), null, "questionnaire");
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "evidence_file_uploaded",
      companyId: "company-1",
    }));
  });
});
