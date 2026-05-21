const express = require("express");
const request = require("supertest");

const mockSendQuestionnaire = jest.fn();
const mockGetQuestionnaire = jest.fn();
const mockCreateEvidence = jest.fn();
const mockVerifyEvidence = jest.fn();
const mockRejectEvidence = jest.fn();

jest.mock("../middleware/auth", () => ({
  authenticate: (req, _res, next) => {
    req.user = {
      id: "user-1",
      email: "user@example.com",
      companyId: "company-1",
      role: "ANALYST",
    };
    return next();
  },
}));

jest.mock("../middlewares/rbac", () => ({
  requirePermission: () => (_req, _res, next) => next(),
}));

jest.mock("../services/supplier.service", () => ({
  sendQuestionnaire: (...args) => mockSendQuestionnaire(...args),
  getQuestionnaire: (...args) => mockGetQuestionnaire(...args),
  createEvidence: (...args) => mockCreateEvidence(...args),
  verifyEvidence: (...args) => mockVerifyEvidence(...args),
  rejectEvidence: (...args) => mockRejectEvidence(...args),
  listEvidence: jest.fn(async () => []),
  list: jest.fn(),
  summary: jest.fn(),
  getById: jest.fn(),
  toSupplierView: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  archive: jest.fn(),
  remove: jest.fn(),
  getScorecard: jest.fn(),
  recalculateScore: jest.fn(),
}));

const supplierRoutes = require("../routes/supplier.routes");
const { sendError } = require("../utils/apiResponse");

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.io = { emit: jest.fn() };
    next();
  });
  app.use("/suppliers", supplierRoutes);
  app.use((error, _req, res, _next) => sendError(res, {
    statusCode: error.status || 500,
    message: error.message,
  }));
  return app;
}

describe("supplier questionnaire routes", () => {
  const app = createTestApp();
  const supplierId = "8b853a60-3b7f-4ca6-b65c-3b9b9723df2e";

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendQuestionnaire.mockResolvedValue({
      message: "Questionnaire sent successfully.",
      questionnaire: { supplierId, questionnaireStatus: "sent" },
      supplierView: { id: supplierId },
    });
    mockGetQuestionnaire.mockResolvedValue({ supplierId, questionnaireStatus: "sent" });
    mockCreateEvidence.mockResolvedValue({ id: "1f4f0e28-8bdf-4d9b-8c02-41411497bd30", status: "submitted" });
    mockVerifyEvidence.mockResolvedValue({ id: "1f4f0e28-8bdf-4d9b-8c02-41411497bd30", status: "verified" });
    mockRejectEvidence.mockResolvedValue({ id: "1f4f0e28-8bdf-4d9b-8c02-41411497bd30", status: "rejected" });
  });

  test("send questionnaire uses authenticated company scope", async () => {
    const response = await request(app).post(`/suppliers/${supplierId}/send-questionnaire`).send({});

    expect(response.status).toBe(200);
    expect(mockSendQuestionnaire).toHaveBeenCalledWith(
      supplierId,
      "company-1",
      expect.objectContaining({ id: "user-1" }),
      {},
      expect.objectContaining({ ipAddress: expect.anything() }),
    );
  });

  test("get questionnaire uses authenticated company scope", async () => {
    const response = await request(app).get(`/suppliers/${supplierId}/questionnaire`);

    expect(response.status).toBe(200);
    expect(mockGetQuestionnaire).toHaveBeenCalledWith(supplierId, "company-1");
  });

  test("creates evidence with authenticated company scope", async () => {
    const response = await request(app).post(`/suppliers/${supplierId}/evidence`).send({
      evidenceType: "ghg_inventory",
      title: "2026 GHG inventory",
      status: "submitted",
    });

    expect(response.status).toBe(201);
    expect(mockCreateEvidence).toHaveBeenCalledWith(
      supplierId,
      "company-1",
      expect.objectContaining({ evidenceType: "ghg_inventory" }),
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({ ipAddress: expect.anything() }),
    );
  });

  test("verifies evidence with authenticated company scope", async () => {
    const evidenceId = "1f4f0e28-8bdf-4d9b-8c02-41411497bd30";
    const response = await request(app).patch(`/suppliers/${supplierId}/evidence/${evidenceId}/verify`).send({});

    expect(response.status).toBe(200);
    expect(mockVerifyEvidence).toHaveBeenCalledWith(
      supplierId,
      evidenceId,
      "company-1",
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({ ipAddress: expect.anything() }),
    );
  });

  test("rejects evidence with authenticated company scope", async () => {
    const evidenceId = "1f4f0e28-8bdf-4d9b-8c02-41411497bd30";
    const response = await request(app).patch(`/suppliers/${supplierId}/evidence/${evidenceId}/reject`).send({ notes: "Wrong period" });

    expect(response.status).toBe(200);
    expect(mockRejectEvidence).toHaveBeenCalledWith(
      supplierId,
      evidenceId,
      "company-1",
      expect.objectContaining({ notes: "Wrong period" }),
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({ ipAddress: expect.anything() }),
    );
  });
});
