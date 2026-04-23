const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");

const mockUserFindOne = jest.fn();
const mockUserFindById = jest.fn();
const mockUserCreate = jest.fn();
const mockUserScopeFindOne = jest.fn();
const mockUserScopeFindByPk = jest.fn();
const mockProvisionCompanyForUser = jest.fn(async (user) => user);
const mockEnsureCompanyContext = jest.fn(async (user) => user);
const mockSendResetPasswordEmail = jest.fn();
const mockSendWelcomeEmail = jest.fn();
const mockSendEmailVerificationEmail = jest.fn();

jest.mock("mongoose", () => ({
  connection: {
    readyState: 1,
  },
}));

jest.mock("../models", () => ({
  User: {
    findOne: (...args) => mockUserFindOne(...args),
    findById: (...args) => mockUserFindById(...args),
    create: (...args) => mockUserCreate(...args),
    scope: jest.fn(() => ({
      findOne: (...args) => mockUserScopeFindOne(...args),
      findByPk: (...args) => mockUserScopeFindByPk(...args),
    })),
  },
}));

jest.mock("../services/userContext.service", () => ({
  provisionCompanyForUser: (...args) => mockProvisionCompanyForUser(...args),
  ensureCompanyContext: (...args) => mockEnsureCompanyContext(...args),
}));

jest.mock("../services/emailService", () => ({
  sendResetPasswordEmail: (...args) => mockSendResetPasswordEmail(...args),
  sendWelcomeEmail: (...args) => mockSendWelcomeEmail(...args),
  sendEmailVerificationEmail: (...args) => mockSendEmailVerificationEmail(...args),
}));

const authRoutes = require("../routes/auth");
const { notFoundHandler, errorHandler } = require("../middlewares/errorHandler");

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function createMockUser(overrides = {}) {
  return {
    id: "5f2d4f12-6f65-40c3-b9a7-a4df4f9022aa",
    email: "test@example.com",
    name: "Test User",
    role: "ANALYST",
    companyId: "company-1",
    status: "ACTIVE",
    isVerified: true,
    password: "$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    refreshTokenHash: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    save: jest.fn(async function save() { return this; }),
    ...overrides,
  };
}

describe("auth routes", () => {
  const app = createTestApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindById.mockResolvedValue(null);
    mockUserScopeFindOne.mockResolvedValue(null);
    mockUserScopeFindByPk.mockResolvedValue(null);
    mockUserFindOne.mockResolvedValue(null);
  });

  test("POST /auth/signup returns 400 for invalid payload", async () => {
    const response = await request(app).post("/auth/signup").send({
      name: "Test User",
      email: "invalid-email",
      password: "StrongPass1!",
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Validation failed");
  });

  test("POST /auth/signup returns 409 when email already exists", async () => {
    mockUserFindOne.mockResolvedValue(createMockUser({ email: "existing@example.com" }));

    const response = await request(app).post("/auth/signup").send({
      name: "Existing User",
      email: "existing@example.com",
      password: "StrongPass1!",
      confirmPassword: "StrongPass1!",
    });

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/already exists/i);
  });

  test("POST /auth/signup creates account and sends verification email", async () => {
    const createdUser = createMockUser({
      email: "newuser@example.com",
      isVerified: false,
    });
    mockUserCreate.mockResolvedValue(createdUser);
    mockProvisionCompanyForUser.mockResolvedValue(createdUser);

    const response = await request(app).post("/auth/signup").send({
      name: "New User",
      email: "newuser@example.com",
      password: "StrongPass1!",
      confirmPassword: "StrongPass1!",
      companyName: "Acme Logistics",
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.email).toBe("newuser@example.com");
    expect(response.body.data.verificationRequired).toBe(true);
    expect(mockSendEmailVerificationEmail).toHaveBeenCalledTimes(1);
  });

  test("POST /auth/login returns 401 for unknown user", async () => {
    mockUserScopeFindOne.mockResolvedValue(null);

    const response = await request(app).post("/auth/login").send({
      email: "nobody@example.com",
      password: "StrongPass1!",
    });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/invalid email or password/i);
  });

  test("POST /auth/login blocks unverified users with 403", async () => {
    const user = createMockUser({
      email: "unverified@example.com",
      isVerified: false,
    });
    mockUserScopeFindOne.mockResolvedValue(user);

    const bcrypt = require("bcryptjs");
    jest.spyOn(bcrypt, "compare").mockResolvedValue(true);

    const response = await request(app).post("/auth/login").send({
      email: "unverified@example.com",
      password: "StrongPass1!",
    });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/verify your email/i);
  });

  test("POST /auth/login blocks suspended users with 403", async () => {
    const user = createMockUser({
      email: "suspended@example.com",
      status: "SUSPENDED",
    });
    mockUserScopeFindOne.mockResolvedValue(user);

    const response = await request(app).post("/auth/login").send({
      email: "suspended@example.com",
      password: "StrongPass1!",
    });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/suspended/i);
  });

  test("GET /auth/verify-email returns method guidance", async () => {
    const response = await request(app).get("/auth/verify-email");

    expect(response.status).toBe(405);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/use post/i);
  });

  test("POST /auth/verify-email returns token invalid for unknown token", async () => {
    mockUserScopeFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const response = await request(app).post("/auth/verify-email").send({
      token: "invalid-verification-token",
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/token invalid/i);
  });

  test("POST /auth/resend-verification always returns generic success", async () => {
    mockUserScopeFindOne.mockResolvedValue(null);

    const response = await request(app).post("/auth/resend-verification").send({
      email: "unknown@example.com",
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toMatch(/if an unverified account exists/i);
  });

  test("POST /auth/refresh-token returns validation error for missing token", async () => {
    const response = await request(app).post("/auth/refresh-token").send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Validation failed");
  });

  test("GET /auth/me returns 401 without bearer token", async () => {
    const response = await request(app).get("/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/unauthorized/i);
  });

  test("GET /auth/me returns 401 for expired bearer token", async () => {
    const expiredToken = jwt.sign(
      { sub: "user-1", role: "ANALYST" },
      process.env.JWT_SECRET,
      { expiresIn: -1 },
    );

    const response = await request(app).get("/auth/me").set("Authorization", `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/expired/i);
  });

  test("POST /auth/logout clears refresh token for authenticated user", async () => {
    const user = createMockUser({
      id: "a1b2c3d4-6f65-40c3-b9a7-a4df4f9022ab",
      email: "logout@example.com",
    });
    mockUserFindById.mockResolvedValue(user);
    mockEnsureCompanyContext.mockResolvedValue(user);
    mockUserScopeFindByPk.mockResolvedValue(user);
    const accessToken = jwt.sign(
      { sub: user.id, role: user.role, companyId: user.companyId },
      process.env.JWT_SECRET,
      { expiresIn: "10m" },
    );

    const response = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toMatch(/logout successful/i);
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(user.refreshTokenHash).toBeNull();
  });
});
