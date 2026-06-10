const express = require("express");
const request = require("supertest");

const shipmentListMock = { data: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 } };

jest.mock("../middleware/auth", () => ({
  authenticate: (req, _res, next) => {
    req.user = global.__TEST_USER__ || {
      id: "user-1",
      companyId: "company-1",
      email: "user@example.com",
      role: "manager",
    };
    req.io = { emit: jest.fn() };
    next();
  },
}));

jest.mock("../services/settings.service", () => ({
  getByCompanyId: jest.fn().mockResolvedValue({
    carbonPricePerTon: 55,
    emissionFactorOverrides: {},
  }),
}));

jest.mock("../services/shipment.service", () => ({
  list: jest.fn().mockResolvedValue(shipmentListMock),
  getById: jest.fn().mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", companyId: "company-1", reference: "SHP-1" }),
  create: jest.fn().mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", companyId: "company-1", reference: "SHP-1" }),
  update: jest.fn().mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", companyId: "company-1", reference: "SHP-1", status: "SUBMITTED" }),
  recalculate: jest.fn().mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", companyId: "company-1", reference: "SHP-1", calculationStatus: "calculated" }),
  archive: jest.fn().mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", companyId: "company-1", reference: "SHP-1", status: "ARCHIVED" }),
  remove: jest.fn().mockResolvedValue({ success: true }),
}));

const ShipmentService = require("../services/shipment.service");
const router = require("../routes/shipment.routes");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/shipments", router);
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

describe("shipment routes", () => {
  beforeEach(() => {
    global.__TEST_USER__ = {
      id: "user-1",
      companyId: "company-1",
      email: "user@example.com",
      role: "manager",
    };
    jest.clearAllMocks();
  });

  afterAll(() => {
    delete global.__TEST_USER__;
  });

  test("allows an authorized user to create a shipment", async () => {
    const app = buildApp();
    const response = await request(app)
      .post("/api/shipments")
      .send({
        shipmentReference: "SHP-2026-001",
        reference: "SHP-2026-001",
        bolNumber: "BOL-1001",
        containerId: "CONT-77",
        origin: "Karachi",
        destination: "Rotterdam",
        transportMode: "OCEAN",
        carrier: "Maersk",
        distanceKm: 1200,
        weightKg: 2500,
        costUsd: 500,
        currency: "USD",
        shipmentDate: "2026-06-01",
        reportingPeriod: "2026-06",
        status: "DRAFT",
        notes: "Priority ocean shipment",
      });

    expect(response.status).toBe(201);
    expect(ShipmentService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: "SHP-2026-001",
        shipmentReference: "SHP-2026-001",
        bolNumber: "BOL-1001",
        containerId: "CONT-77",
        transportMode: "OCEAN",
        reportingPeriod: "2026-06",
        notes: "Priority ocean shipment",
      }),
      "company-1",
      55,
      expect.objectContaining({ id: "user-1" }),
      expect.any(Object),
    );
    expect(response.body.data.reference).toBe("SHP-1");
  });

  test("allows shipment creation without a linked supplier", async () => {
    const app = buildApp();
    const response = await request(app)
      .post("/api/shipments")
      .send({
        shipmentReference: "SHP-2026-002",
        reference: "SHP-2026-002",
        origin: "Lahore",
        destination: "Dubai",
        transportMode: "AIR",
        carrier: "Emirates SkyCargo",
        distanceKm: 2000,
        weightKg: 800,
        costUsd: 320,
        currency: "USD",
        shipmentDate: "2026-06-02",
        status: "SUBMITTED",
      });

    expect(response.status).toBe(201);
    expect(ShipmentService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        shipmentReference: "SHP-2026-002",
        status: "SUBMITTED",
      }),
      "company-1",
      55,
      expect.objectContaining({ id: "user-1" }),
      expect.any(Object),
    );
  });

  test("rejects invalid shipment mode", async () => {
    const app = buildApp();
    const response = await request(app)
      .post("/api/shipments")
      .send({
        shipmentReference: "SHP-2026-001",
        origin: "Karachi",
        destination: "Rotterdam",
        transportMode: "SPACE",
        carrier: "Maersk",
        distanceKm: 1200,
        weightKg: 2500,
        costUsd: 500,
        shipmentDate: "2026-06-01",
      });

    expect(response.status).toBe(422);
    expect(response.body.message).toMatch(/validation failed/i);
    expect(ShipmentService.create).not.toHaveBeenCalled();
  });

  test("allows viewers to list shipments when they have shipment:view", async () => {
    global.__TEST_USER__ = {
      id: "user-2",
      companyId: "company-1",
      email: "viewer@example.com",
      role: "viewer",
    };
    const app = buildApp();
    const response = await request(app).get("/api/shipments");

    expect(response.status).toBe(200);
    expect(ShipmentService.list).toHaveBeenCalled();
  });

  test("blocks viewers from creating shipments", async () => {
    global.__TEST_USER__ = {
      id: "user-2",
      companyId: "company-1",
      email: "viewer@example.com",
      role: "viewer",
    };
    const app = buildApp();
    const response = await request(app)
      .post("/api/shipments")
      .send({
        shipmentReference: "SHP-2026-001",
        origin: "Karachi",
        destination: "Rotterdam",
        transportMode: "ROAD",
        carrier: "DHL",
        distanceKm: 100,
        weightKg: 1000,
        costUsd: 0,
        shipmentDate: "2026-06-01",
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/shipment:create/i);
    expect(ShipmentService.create).not.toHaveBeenCalled();
  });

  test("calls recalculate for authorized users", async () => {
    const app = buildApp();
    const response = await request(app)
      .post("/api/shipments/11111111-1111-4111-8111-111111111111/recalculate")
      .send({});

    expect(response.status).toBe(200);
    expect(ShipmentService.recalculate).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "company-1",
      expect.objectContaining({ id: "user-1" }),
    );
  });

  test("calls archive for authorized users", async () => {
    const app = buildApp();
    const response = await request(app)
      .patch("/api/shipments/11111111-1111-4111-8111-111111111111/archive")
      .send({});

    expect(response.status).toBe(200);
    expect(ShipmentService.archive).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "company-1",
      expect.objectContaining({ id: "user-1" }),
    );
    expect(response.body.data.status).toBe("ARCHIVED");
  });
});
