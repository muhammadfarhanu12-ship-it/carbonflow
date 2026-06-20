const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");

const mockUserFindById = jest.fn();
const mockUserScopeFindOne = jest.fn();
const mockUserScopeFindByPk = jest.fn();
const mockAuditLogCreate = jest.fn();
const mockBcryptCompare = jest.fn();

jest.mock("../models", () => ({
  User: {
    findById: (...args) => mockUserFindById(...args),
    scope: jest.fn(() => ({
      findOne: (...args) => mockUserScopeFindOne(...args),
      findByPk: (...args) => mockUserScopeFindByPk(...args),
    })),
  },
  AuditLog: {
    create: (...args) => mockAuditLogCreate(...args),
  },
}));

jest.mock("bcryptjs", () => ({
  compare: (...args) => mockBcryptCompare(...args),
}));

const adminAuthController = require("../modules/admin/controllers/adminAuth.controller");
const {
  verifyAdminToken,
  requireAdminPermission,
} = require("../modules/admin/middleware/adminAuthMiddleware");
const { notFoundHandler, errorHandler } = require("../middlewares/errorHandler");

function createAdminUser(overrides = {}) {
  return {
    id: "admin-user-1",
    _id: "admin-user-1",
    name: "Platform Admin",
    email: "admin@example.com",
    password: "$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    role: "ANALYST",
    status: "ACTIVE",
    isVerified: true,
    isPlatformAdmin: true,
    adminRole: "SUPER_ADMIN",
    adminPermissions: [
      "admin",
      "admin:users",
      "admin:companies",
      "admin:plans",
      "admin:factors",
      "admin:audit",
      "admin:settings",
    ],
    adminStatus: "active",
    adminCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
    adminLastLoginAt: null,
    forcePasswordChange: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    save: jest.fn(async function save() { return this; }),
    ...overrides,
  };
}

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.post("/admin/auth/login", (req, res, next) => adminAuthController.login(req, res).catch(next));
  app.get("/admin/auth/me", verifyAdminToken, (req, res, next) => adminAuthController.me(req, res).catch(next));
  app.get("/admin/protected", verifyAdminToken, requireAdminPermission("admin:users"), (_req, res) => {
    res.status(200).json({ success: true });
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("admin auth routes", () => {
  const app = createTestApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuditLogCreate.mockResolvedValue({});
    mockUserFindById.mockResolvedValue(null);
    mockUserScopeFindOne.mockResolvedValue(null);
    mockUserScopeFindByPk.mockResolvedValue(null);
    mockBcryptCompare.mockResolvedValue(true);
  });

  test("normal user cannot login to admin panel", async () => {
    mockUserScopeFindOne.mockResolvedValue(createAdminUser({
      email: "user@example.com",
      isPlatformAdmin: false,
      adminRole: null,
      adminPermissions: [],
    }));

    const response = await request(app).post("/admin/auth/login").send({
      email: "user@example.com",
      password: "StrongPass1!",
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("This account does not have admin panel access.");
  });

  test("SUPER_ADMIN can login to admin panel", async () => {
    const user = createAdminUser();
    mockUserScopeFindOne.mockResolvedValue(user);

    const response = await request(app).post("/admin/auth/login").send({
      email: "admin@example.com",
      password: "StrongPass1!",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.admin).toMatchObject({
      email: "admin@example.com",
      adminRole: "SUPER_ADMIN",
      role: "SUPER_ADMIN",
    });
    expect(response.body.data.admin.adminPermissions).toContain("admin:users");
    expect(user.save).toHaveBeenCalled();
  });

  test("disabled admin cannot login", async () => {
    mockUserScopeFindOne.mockResolvedValue(createAdminUser({ adminStatus: "disabled" }));

    const response = await request(app).post("/admin/auth/login").send({
      email: "admin@example.com",
      password: "StrongPass1!",
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Admin account is disabled");
  });

  test("admin me endpoint rejects normal user", async () => {
    const user = createAdminUser({ isPlatformAdmin: false, adminRole: null, adminPermissions: [] });
    mockUserFindById.mockResolvedValue(user);
    const token = jwt.sign({ type: "admin" }, process.env.JWT_SECRET, { subject: user.id, expiresIn: "10m" });

    const response = await request(app)
      .get("/admin/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("This account does not have admin panel access.");
  });

  test("admin me endpoint accepts SUPER_ADMIN", async () => {
    const user = createAdminUser();
    mockUserFindById.mockResolvedValue(user);
    const token = jwt.sign({ type: "admin" }, process.env.JWT_SECRET, { subject: user.id, expiresIn: "10m" });

    const response = await request(app)
      .get("/admin/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      email: "admin@example.com",
      adminRole: "SUPER_ADMIN",
    });
  });

  test("protected admin route rejects normal user", async () => {
    const user = createAdminUser({ isPlatformAdmin: false, adminRole: null, adminPermissions: [] });
    mockUserFindById.mockResolvedValue(user);
    const token = jwt.sign({ type: "admin" }, process.env.JWT_SECRET, { subject: user.id, expiresIn: "10m" });

    const response = await request(app)
      .get("/admin/protected")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("This account does not have admin panel access.");
  });

  test("protected admin route accepts SUPER_ADMIN with permission", async () => {
    const user = createAdminUser();
    mockUserFindById.mockResolvedValue(user);
    const token = jwt.sign({ type: "admin" }, process.env.JWT_SECRET, { subject: user.id, expiresIn: "10m" });

    const response = await request(app)
      .get("/admin/protected")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
