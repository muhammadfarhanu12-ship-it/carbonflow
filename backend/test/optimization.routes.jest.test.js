const express = require("express");
const jwt = require("jsonwebtoken");
const request = require("supertest");

const mockUserFindById = jest.fn();
const mockEnsureCompanyContext = jest.fn(async (user) => user);
const mockGetContext = jest.fn();
const mockAnalyze = jest.fn();
const mockListRuns = jest.fn();
const mockGetRun = jest.fn();
const mockUpdateRecommendationStatus = jest.fn();
const mockBuildExport = jest.fn();

jest.mock("../models", () => ({
  User: {
    findById: (...args) => mockUserFindById(...args),
  },
}));

jest.mock("../services/userContext.service", () => ({
  ensureCompanyContext: (...args) => mockEnsureCompanyContext(...args),
}));

jest.mock("../services/optimizationService", () => ({
  getContext: (...args) => mockGetContext(...args),
  analyze: (...args) => mockAnalyze(...args),
  listRuns: (...args) => mockListRuns(...args),
  getRun: (...args) => mockGetRun(...args),
  updateRecommendationStatus: (...args) => mockUpdateRecommendationStatus(...args),
  buildExport: (...args) => mockBuildExport(...args),
}));

const optimizationRoutes = require("../routes/optimization.routes");
const { notFoundHandler, errorHandler } = require("../middlewares/errorHandler");

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/optimization", optimizationRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function user(overrides = {}) {
  return {
    id: "user-1",
    email: "user@example.com",
    role: "admin",
    companyId: "company-a",
    status: "ACTIVE",
    isVerified: true,
    ...overrides,
  };
}

function tokenFor(id = "user-1") {
  return jwt.sign({ sub: id }, process.env.JWT_SECRET, { expiresIn: "10m" });
}

describe("optimization routes auth, RBAC, and scoping", () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindById.mockResolvedValue(user());
    mockGetContext.mockResolvedValue({ totalShipmentsAnalyzed: 0, analysisMode: "rule_based" });
    mockAnalyze.mockResolvedValue({ runId: "run-1", recommendations: [], analysisMode: "rule_based" });
    mockListRuns.mockResolvedValue([]);
    mockGetRun.mockResolvedValue({ id: "run-1", companyId: "company-a", recommendations: [] });
    mockUpdateRecommendationStatus.mockResolvedValue({ id: "rec-1", status: "planned" });
    mockBuildExport.mockResolvedValue({ fileName: "optimization-run-1.csv", contentType: "text/csv", content: "recommendationId\nrec-1" });
  });

  test("unauthenticated requests cannot access context or run analysis", async () => {
    expect((await request(app).get("/api/optimization/context")).status).toBe(401);
    expect((await request(app).post("/api/optimization/analyze").send({ question: "Routes" })).status).toBe(401);
  });

  test("viewer can view but cannot run analysis", async () => {
    mockUserFindById.mockResolvedValue(user({ role: "viewer" }));

    const context = await request(app).get("/api/optimization/context").set("Authorization", `Bearer ${tokenFor()}`);
    const analyze = await request(app).post("/api/optimization/analyze").set("Authorization", `Bearer ${tokenFor()}`).send({ question: "Routes" });

    expect(context.status).toBe(200);
    expect(analyze.status).toBe(403);
  });

  test("manager can run analysis with company-scoped user context", async () => {
    mockUserFindById.mockResolvedValue(user({ role: "manager", companyId: "company-a" }));

    const response = await request(app)
      .post("/api/optimization/analyze")
      .set("Authorization", `Bearer ${tokenFor()}`)
      .send({ question: "Find route savings" });

    expect(response.status).toBe(200);
    expect(mockAnalyze).toHaveBeenCalledWith(expect.objectContaining({ question: "Find route savings" }), expect.objectContaining({ companyId: "company-a" }), expect.any(Object));
  });

  test("recommendation status update requires optimization:update", async () => {
    mockUserFindById.mockResolvedValue(user({ role: "viewer" }));
    const denied = await request(app)
      .patch("/api/optimization/recommendations/rec-1/status")
      .set("Authorization", `Bearer ${tokenFor()}`)
      .send({ status: "planned" });

    mockUserFindById.mockResolvedValue(user({ role: "admin" }));
    const allowed = await request(app)
      .patch("/api/optimization/recommendations/rec-1/status")
      .set("Authorization", `Bearer ${tokenFor()}`)
      .send({ status: "planned" });

    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(200);
    expect(mockUpdateRecommendationStatus).toHaveBeenCalledWith("company-a", "rec-1", "planned", expect.any(Object), expect.any(Object));
  });

  test("export requires optimization:export and uses company scoping", async () => {
    mockUserFindById.mockResolvedValue(user({ role: "viewer" }));
    const denied = await request(app)
      .post("/api/optimization/runs/run-1/export")
      .set("Authorization", `Bearer ${tokenFor()}`)
      .send({ format: "CSV" });

    mockUserFindById.mockResolvedValue(user({ role: "admin", companyId: "company-a" }));
    const allowed = await request(app)
      .post("/api/optimization/runs/run-1/export")
      .set("Authorization", `Bearer ${tokenFor()}`)
      .send({ format: "CSV" });

    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(200);
    expect(allowed.headers["content-disposition"]).toContain("optimization-run-1.csv");
    expect(mockBuildExport).toHaveBeenCalledWith("company-a", "run-1", "CSV", expect.any(Object), expect.any(Object));
  });

  test("company A cannot access company B run when service enforces not found", async () => {
    mockGetRun.mockRejectedValueOnce(Object.assign(new Error("Optimization run not found"), { statusCode: 404 }));
    const response = await request(app)
      .get("/api/optimization/runs/company-b-run")
      .set("Authorization", `Bearer ${tokenFor()}`);

    expect(response.status).toBe(404);
  });

  test("company A cannot update or export company B records when service enforces not found", async () => {
    mockUpdateRecommendationStatus.mockRejectedValueOnce(Object.assign(new Error("Recommendation not found"), { statusCode: 404 }));
    mockBuildExport.mockRejectedValueOnce(Object.assign(new Error("Optimization run not found"), { statusCode: 404 }));

    const update = await request(app)
      .patch("/api/optimization/recommendations/company-b-rec/status")
      .set("Authorization", `Bearer ${tokenFor()}`)
      .send({ status: "planned" });
    const exported = await request(app)
      .post("/api/optimization/runs/company-b-run/export")
      .set("Authorization", `Bearer ${tokenFor()}`)
      .send({ format: "CSV" });

    expect(update.status).toBe(404);
    expect(exported.status).toBe(404);
  });
});
