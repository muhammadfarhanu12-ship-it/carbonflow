const mockIsMailerConfigured = jest.fn();
const mockSendSupplierQuestionnaireEmail = jest.fn();
const mockCompanyFindById = jest.fn();

jest.mock("../utils/mailer", () => ({
  isMailerConfigured: (...args) => mockIsMailerConfigured(...args),
}));

jest.mock("../services/emailService", () => ({
  sendSupplierQuestionnaireEmail: (...args) => mockSendSupplierQuestionnaireEmail(...args),
}));

jest.mock("../models", () => ({
  Company: {
    findById: (...args) => mockCompanyFindById(...args),
  },
}));

const {
  EMAIL_NOT_CONFIGURED_MESSAGE,
  SupplierQuestionnaireService,
} = require("../services/supplierQuestionnaire.service");

function createSupplier(overrides = {}) {
  const supplier = {
    _id: "8b853a60-3b7f-4ca6-b65c-3b9b9723df2e",
    id: "8b853a60-3b7f-4ca6-b65c-3b9b9723df2e",
    companyId: "company-1",
    name: "Supplier One",
    contactEmail: "supplier@example.com",
    invitationStatus: "not_sent",
    questionnaireStatus: "not_sent",
    questionnaireReminderCount: 0,
    update: jest.fn(async function update(values) {
      Object.assign(supplier, values);
      return supplier;
    }),
    constructor: {
      findOne: jest.fn(async () => supplier),
    },
    ...overrides,
  };
  return supplier;
}

describe("SupplierQuestionnaireService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCompanyFindById.mockReturnValue({
      lean: jest.fn(async () => ({ name: "Acme Manufacturing" })),
    });
  });

  test("sends questionnaire with email configured", async () => {
    mockIsMailerConfigured.mockReturnValue(true);
    const supplier = createSupplier();

    const result = await SupplierQuestionnaireService.send({ supplier, companyId: "company-1" });

    expect(result.questionnaire.questionnaireStatus).toBe("sent");
    expect(result.questionnaire.emailStatus.sent).toBe(true);
    expect(mockSendSupplierQuestionnaireEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "supplier@example.com",
      supplierName: "Supplier One",
      companyName: "Acme Manufacturing",
    }));
    expect(supplier.questionnaireTokenHash).toEqual(expect.any(String));
  });

  test("creates questionnaire without email configured", async () => {
    mockIsMailerConfigured.mockReturnValue(false);
    const supplier = createSupplier();

    const result = await SupplierQuestionnaireService.send({ supplier, companyId: "company-1" });

    expect(result.message).toBe(EMAIL_NOT_CONFIGURED_MESSAGE);
    expect(result.questionnaire.emailStatus.configured).toBe(false);
    expect(mockSendSupplierQuestionnaireEmail).not.toHaveBeenCalled();
  });

  test("resends questionnaire and increments reminder count", async () => {
    mockIsMailerConfigured.mockReturnValue(false);
    const supplier = createSupplier({ questionnaireReminderCount: 1 });

    const result = await SupplierQuestionnaireService.send({ supplier, companyId: "company-1", reminder: true });

    expect(result.questionnaire.questionnaireReminderCount).toBe(2);
    expect(result.questionnaire.lastReminderSentAt).toBeTruthy();
  });

  test("updates questionnaire status", async () => {
    const supplier = createSupplier({ questionnaireStatus: "sent" });

    const result = await SupplierQuestionnaireService.updateStatus({ supplier, status: "submitted" });

    expect(result.questionnaire.questionnaireStatus).toBe("submitted");
    expect(result.questionnaire.questionnaireSubmittedAt).toBeTruthy();
  });

  test("marks questionnaire overdue", async () => {
    const supplier = createSupplier({ questionnaireStatus: "sent" });

    const result = await SupplierQuestionnaireService.updateStatus({ supplier, status: "overdue" });

    expect(result.questionnaire.questionnaireStatus).toBe("overdue");
    expect(result.questionnaire.invitationStatus).toBe("overdue");
  });
});
