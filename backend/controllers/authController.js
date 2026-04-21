const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { body, validationResult, matchedData } = require("express-validator");
const { User } = require("../models");
const env = require("../config/env");
const { sendResetPasswordEmail, sendWelcomeEmail } = require("../services/emailService");
const UserContextService = require("../services/userContext.service");
const { sendSuccess, sendError } = require("../utils/apiResponse");

function createValidationError(message, errors = []) {
  const error = new Error(message);
  error.statusCode = 400;
  error.errors = errors;
  return error;
}

function createServiceUnavailableError(message) {
  const error = new Error(message);
  error.statusCode = 503;
  return error;
}

function ensureDatabaseReady() {
  if (mongoose.connection.readyState !== 1) {
    throw createServiceUnavailableError("Backend API is online, but the database is unavailable. Verify MongoDB is running and MONGO_URI is correct.");
  }
}

function buildRequestMeta(req) {
  return {
    method: req.method,
    path: req.originalUrl,
    origin: req.headers.origin || null,
    email: req.body?.email || null,
  };
}

function logAuthFailure(scope, error, req) {
  console.error(`[${scope}] failed`, {
    ...buildRequestMeta(req),
    statusCode: error.statusCode || error.status || 500,
    message: error.message,
    stack: error.stack,
  });
}

function generateAccessToken(user, rememberMe = false) {
  return jwt.sign(
    { sub: user.id, role: user.role, companyId: user.companyId || null },
    env.auth.jwtSecret,
    { expiresIn: rememberMe ? "7d" : env.auth.jwtExpiresIn },
  );
}

function generateRefreshToken(user, rememberMe = false) {
  return jwt.sign(
    { sub: user.id, type: "refresh" },
    env.auth.jwtRefreshSecret,
    { expiresIn: rememberMe ? env.auth.jwtRefreshExpiresIn : "7d" },
  );
}

async function storeRefreshToken(user, refreshToken) {
  user.refreshTokenHash = await bcrypt.hash(refreshToken, env.auth.bcryptSaltRounds);
  await user.save();
}

function toSafeUser(user) {
  const normalizedRole = user.role === "USER" ? "ANALYST" : user.role;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizedRole,
    companyId: user.companyId ?? null,
    organizationId: user.companyId ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

exports.signupValidators = [
  body("name").optional({ values: "falsy" }).trim().isLength({ min: 2, max: 120 }).withMessage("Name must be between 2 and 120 characters"),
  body("fullName").optional({ values: "falsy" }).trim().isLength({ min: 2, max: 120 }).withMessage("Name must be between 2 and 120 characters"),
  body("email").trim().normalizeEmail().isEmail().withMessage("A valid email address is required"),
  body("companyName").optional({ values: "falsy" }).trim().isLength({ max: 120 }).withMessage("Company name must be 120 characters or less"),
  body("company").optional({ values: "falsy" }).trim().isLength({ max: 120 }).withMessage("Company name must be 120 characters or less"),
  body("password").isString().isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  body("confirmPassword").optional({ values: "falsy" }).custom((value, { req }) => value === req.body.password).withMessage("Confirm password does not match"),
];

exports.loginValidators = [
  body("email").trim().normalizeEmail().isEmail().withMessage("A valid email address is required"),
  body("password").isString().notEmpty().withMessage("Password is required"),
  body("rememberMe").optional().isBoolean(),
];

exports.forgotPasswordValidators = [
  body("email").trim().normalizeEmail().isEmail().withMessage("A valid email address is required"),
];

exports.resetPasswordValidators = [
  body("token").isString().notEmpty().withMessage("Reset token is required"),
  body("password").isString().isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  body("confirmPassword").custom((value, { req }) => value === req.body.password).withMessage("Confirm password does not match"),
];

exports.refreshTokenValidators = [
  body("refreshToken").isString().notEmpty().withMessage("Refresh token is required"),
];

exports.signup = async (req, res) => {
  try {
    console.log("[auth.signup] attempt", buildRequestMeta(req));
    ensureDatabaseReady();
    const resolvedName = req.body.name || req.body.fullName;
    if (!resolvedName || !req.body.email || !req.body.password) {
      return sendError(res, {
        statusCode: 400,
        message: "Missing required fields: name, email, password",
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw createValidationError("Validation failed", errors.array());
    }

    const payload = matchedData(req, { locations: ["body"] });
    const existingUser = await User.findOne({ email: payload.email });

    if (existingUser) {
      const error = new Error("An account with that email already exists");
      error.statusCode = 409;
      throw error;
    }

    const passwordHash = await bcrypt.hash(payload.password, env.auth.bcryptSaltRounds);
    const user = await User.create({
      name: resolvedName,
      email: payload.email,
      password: passwordHash,
      role: "ANALYST",
      status: "ACTIVE",
    });

    await UserContextService.provisionCompanyForUser(user, {
      companyName: payload.companyName || payload.company,
    });

    const hydratedUser = await User.findByPk(user.id);
    const accessToken = generateAccessToken(hydratedUser);
    const refreshToken = generateRefreshToken(hydratedUser);
    const authUser = await User.scope("withPassword").findByPk(user.id);
    await storeRefreshToken(authUser, refreshToken);

    void sendWelcomeEmail({
      to: hydratedUser.email,
      name: hydratedUser.name,
    }).catch((emailError) => {
      console.error("[auth.signup] welcome email failed", {
        ...buildRequestMeta(req),
        userId: hydratedUser.id,
        message: emailError.message,
        stack: emailError.stack,
      });
    });

    return sendSuccess(res, {
      statusCode: 201,
      message: "User created successfully",
      data: {
        user: toSafeUser(hydratedUser),
        token: accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logAuthFailure("auth.signup", error, req);
    return sendError(res, {
      statusCode: error.statusCode || error.status || 500,
      message: error.message || "Internal server error",
      errors: error.errors || undefined,
    });
  }
};

exports.login = async (req, res) => {
  try {
    console.log("[auth.login] attempt", buildRequestMeta(req));
    ensureDatabaseReady();
    if (!req.body.email || !req.body.password) {
      return sendError(res, {
        statusCode: 400,
        message: "Missing required fields: email, password",
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw createValidationError("Validation failed", errors.array());
    }

    const payload = matchedData(req, { locations: ["body"] });
    const user = await User.scope("withPassword").findOne({ email: payload.email });

    if (!user) {
      const error = new Error("Invalid email or password");
      error.statusCode = 401;
      throw error;
    }

    if (user.status === "SUSPENDED") {
      const error = new Error("Your account has been suspended");
      error.statusCode = 403;
      throw error;
    }

    const isPasswordValid = await bcrypt.compare(payload.password, user.password);
    if (!isPasswordValid) {
      const error = new Error("Invalid email or password");
      error.statusCode = 401;
      throw error;
    }

    const accessToken = generateAccessToken(user, Boolean(payload.rememberMe));
    const refreshToken = generateRefreshToken(user, Boolean(payload.rememberMe));
    user.lastLoginAt = new Date();
    await storeRefreshToken(user, refreshToken);

    return sendSuccess(res, {
      message: "Login successful",
      data: {
        user: toSafeUser(user),
        token: accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logAuthFailure("auth.login", error, req);
    return sendError(res, {
      statusCode: error.statusCode || error.status || 500,
      message: error.message || "Internal server error",
      errors: error.errors || undefined,
    });
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    ensureDatabaseReady();
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw createValidationError("Validation failed", errors.array());
    }

    const payload = matchedData(req, { locations: ["body"] });
    const user = await User.scope("withPassword").findOne({ email: payload.email });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      user.passwordResetTokenHash = tokenHash;
      user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      const resetUrl = `${env.baseUrl}/auth/reset-password?token=${rawToken}`;
      await sendResetPasswordEmail({
        to: user.email,
        name: user.name,
        resetUrl,
      });
    }

    return sendSuccess(res, {
      message: "If an account exists for that email, a reset link has been sent",
    });
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    ensureDatabaseReady();
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw createValidationError("Validation failed", errors.array());
    }

    const payload = matchedData(req, { locations: ["body"] });
    const tokenHash = crypto.createHash("sha256").update(payload.token).digest("hex");

    const user = await User.scope("withPassword").findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    });

    if (!user) {
      const error = new Error("Reset token is invalid or expired");
      error.statusCode = 400;
      throw error;
    }

    user.password = await bcrypt.hash(payload.password, env.auth.bcryptSaltRounds);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    user.refreshTokenHash = null;
    await user.save();

    return sendSuccess(res, {
      message: "Password reset successful",
    });
  } catch (error) {
    next(error);
  }
};

exports.me = async (req, res, next) => {
  try {
    ensureDatabaseReady();
    const safeUser = toSafeUser(req.user);

    return sendSuccess(res, {
      message: "Authenticated user fetched successfully",
      data: {
        id: safeUser.id,
        email: safeUser.email,
        name: safeUser.name,
        role: safeUser.role,
        companyId: safeUser.companyId,
        organizationId: safeUser.organizationId,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.refreshToken = async (req, res, next) => {
  try {
    ensureDatabaseReady();
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw createValidationError("Validation failed", errors.array());
    }

    const { refreshToken } = matchedData(req, { locations: ["body"] });
    const decoded = jwt.verify(refreshToken, env.auth.jwtRefreshSecret);
    const user = await User.scope("withPassword").findByPk(decoded.sub);

    if (!user || !user.refreshTokenHash) {
      const error = new Error("Refresh token is invalid");
      error.statusCode = 401;
      throw error;
    }

    const isStoredTokenValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isStoredTokenValid) {
      const error = new Error("Refresh token is invalid");
      error.statusCode = 401;
      throw error;
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);
    await storeRefreshToken(user, newRefreshToken);

    return sendSuccess(res, {
      message: "Token refreshed successfully",
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    error.statusCode = error.statusCode || 401;
    next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    ensureDatabaseReady();
    const scopedUser = await User.scope("withPassword").findByPk(req.user.id);
    if (scopedUser) {
      scopedUser.refreshTokenHash = null;
      await scopedUser.save();
    }

    return sendSuccess(res, {
      message: "Logout successful",
    });
  } catch (error) {
    next(error);
  }
};
