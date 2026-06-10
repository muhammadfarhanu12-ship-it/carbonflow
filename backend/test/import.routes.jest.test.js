const express = require("express");
const request = require("supertest");

jest.mock("../middleware/auth", () => ({
  authenticate: (req, _res, next) => {
    req.user = global.__TEST_USER__ || {
      id: "manager-1",
      companyId: "company-1",
      email: "manager@example.com",
      role: "manager",
    };
    req.io = { emit: jest.fn() };
    next();
  },
}));

jest.mock("../controllers/import.controller", () => ({
  importShipments: jest.fn(async (_req, res) => {
    res.status(201).json({ success: true, data: { summary: { successful: 1, failed: 0, total: 1 } } });
  }),
}));

jest.mock("../controllers/importWorkflow.controller", () => ({
  preview: jest.fn(async (_req, res) => {
    res.status(200).json({ success: true, data: { previewId: "preview-1", validRows: 1 } });
  }),
  commit: jest.fn(async (_req, res) => {
    res.status(201).json({ success: true, data: { createdCount: 1 } });
  }),
  commitById: jest.fn(async (_req, res) => {
    res.status(201).json({ success: true, data: { createdCount: 1 } });
  }),
  list: jest.fn(),
  template: jest.fn(),
  get: jest.fn(),
  errors: jest.fn(),
  errorReport: jest.fn(),
}));

const legacyController = require("../controllers/import.controller");
const workflowController = require("../controllers/importWorkflow.controller");
const router = require("../routes/import.routes");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  app.use((error, _req, res, _next) => {
    const statusCode = error.statusCode || error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message,
      errors: error.errors || [],
    });
  });
  return app;
}

describe("import routes permissions", () => {
  beforeEach(() => {
    global.__TEST_USER__ = {
      id: "manager-1",
      companyId: "company-1",
      email: "manager@example.com",
      role: "manager",
    };
    jest.clearAllMocks();
  });

  afterAll(() => {
    delete global.__TEST_USER__;
  });

  test("blocks the legacy writable shipment import endpoint without shipment import permission", async () => {
    global.__TEST_USER__ = {
      id: "viewer-1",
      companyId: "company-1",
      email: "viewer@example.com",
      role: "viewer",
      permissions: ["shipment:view", "import:view"],
    };
    const app = buildApp();
    const response = await request(app)
      .post("/api/import")
      .send({ shipments: [], metadata: { source: "csv", totalRows: 1 } });

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/import:commit/i);
    expect(legacyController.importShipments).not.toHaveBeenCalled();
  });

  test("requires permission for governed shipment preview", async () => {
    global.__TEST_USER__ = {
      id: "viewer-1",
      companyId: "company-1",
      email: "viewer@example.com",
      role: "viewer",
      permissions: ["shipment:view", "import:view"],
    };
    const app = buildApp();
    const response = await request(app)
      .post("/api/imports/shipment/preview")
      .send({ csv: "shipmentReference,origin,destination,mode,distanceKm,weightKg,shipmentDate\nSHP-1,A,B,ROAD,10,100,2026-06-01" });

    expect(response.status).toBe(403);
    expect(workflowController.preview).not.toHaveBeenCalled();
  });

  test("requires permission for governed shipment commit", async () => {
    global.__TEST_USER__ = {
      id: "viewer-1",
      companyId: "company-1",
      email: "viewer@example.com",
      role: "viewer",
      permissions: ["shipment:view", "import:view"],
    };
    const app = buildApp();
    const response = await request(app)
      .post("/api/imports/shipment/commit")
      .send({ csv: "shipmentReference,origin,destination,mode,distanceKm,weightKg,shipmentDate\nSHP-1,A,B,ROAD,10,100,2026-06-01" });

    expect(response.status).toBe(403);
    expect(workflowController.commit).not.toHaveBeenCalled();
  });

  test("allows a manager through governed preview and the secured legacy endpoint", async () => {
    const app = buildApp();

    const previewResponse = await request(app)
      .post("/api/imports/shipment/preview")
      .send({ csv: "shipmentReference,origin,destination,mode,distanceKm,weightKg,shipmentDate\nSHP-1,A,B,ROAD,10,100,2026-06-01" });
    expect(previewResponse.status).toBe(200);
    expect(workflowController.preview).toHaveBeenCalled();

    const legacyResponse = await request(app)
      .post("/api/import")
      .send({ shipments: [{ rowIndex: 2, shipmentReference: "SHP-1", origin: "A", destination: "B", transportMode: "ROAD", distanceKm: 10, weightKg: 100 }], metadata: { source: "csv", totalRows: 1 } });
    expect(legacyResponse.status).toBe(201);
    expect(legacyController.importShipments).toHaveBeenCalled();
  });
});
