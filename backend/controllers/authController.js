const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { body, validationResult, matchedData } = require("express-validator");
const { User } = require("../models");
const env = require("../config/env");
const { sendResetPasswordEmail, sendWelcomeEmail, sendEmailVerificationEmail } = require("../services/emailService");
const UserContextService = require("../services/userContext.service");
const { sendSuccess, sendError } = require("../utils/apiResponse");
const logger = require("../utils/logger");

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

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
  const statusCode = error.statusCode || error.status || 500;
  const message = error.message || "auth request failed";
  const meta = {
    ...buildRequestMeta(req),
    statusCode,
    message,
    stack: env.isProduction ? undefined : error.stack,
  };

  if (statusCode >= 500) {
    logger.error(`${scope}.failed`, meta);
    return;
  }

  logger.warn(`${scope}.failed`, meta);
}

function getSafeErrorMessage(error) {
  const statusCode = error.statusCode || error.status || 500;
  if (statusCode >= 500 && env.isProduction) {
    return "Internal server error";
  }

  return error.message || "Internal server error";
}

function normalizeAuthError(error) {
  if (!error || typeof error !== "object") {
    return {
      statusCode: 500,
      message: "Internal server error",
      errors: undefined,
    };
  }

  if (error.code === 11000) {
    return {
      statusCode: 409,
      message: "An account with that email already exists",
      errors: undefined,
    };
  }

  if (error.name === "TokenExpiredError") {
    return {
      statusCode: 401,
      message: "Refresh token has expired",
      errors: undefined,
    };
  }

  if (error.name === "JsonWebTokenError") {
    return {
      statusCode: 401,
      message: "Refresh token is invalid",
      errors: undefined,
    };
  }

  return {
    statusCode: error.statusCode || error.status || 500,
    message: getSafeErrorMessage(error),
    errors: error.errors || error.details || undefined,
  };
}

function createEmailVerificationToken() {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  return {
    rawToken,
    tokenHash,
    expiresAt: Date.now() + EMAIL_VERIFICATION_TTL_MS,
  };
}

function buildEmailVerificationUrl(token) {
  try {
    const verificationUrl = new URL("/verify-email", env.frontendUrl || env.clientUrl || "http://localhost:5173");
    verificationUrl.searchParams.set("token", token);
    return verificationUrl.toString();
  } catch {
    return `http://localhost:5173/verify-email?token=${token}`;
  }
}

async function issueEmailVerificationToken(user, source = "auth.flow") {
  const { rawToken, tokenHash, expiresAt } = createEmailVerificationToken();

  logger.info(`${source}.verification_token_issued`, {
    userId: user.id,
    email: user.email,
  });

  user.emailVerificationToken = tokenHash;
  user.emailVerificationExpires = expiresAt;
  user.isVerified = false;
  await user.save();

  await sendEmailVerificationEmail({
    to: user.email,
    name: user.name,
    verificationUrl: buildEmailVerificationUrl(rawToken),
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
  body("password")
    .isString()
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/)
    .withMessage("Password must include uppercase, lowercase, number, and special character"),
  body("confirmPassword").optional({ values: "falsy" }).custom((value, { req }) => value === req.body.password).withMessage("Confirm password does not match"),
];

exports.loginValidators = [
  body("email").trim().normalizeEmail().isEmail().withMessage("A valid email address is required"),
  body("password").isString().notEmpty().withMessage("Password is required"),
  body("rememberMe").optional().isBoolean(),
];

exports.verifyEmailValidators = [
  body("token").isString().notEmpty().withMessage("Verification token is required"),
];

exports.resendVerificationValidators = [
  body("email").trim().normalizeEmail().isEmail().withMessage("A valid email address is required"),
];

exports.forgotPasswordValidators = [
  body("email").trim().normalizeEmail().isEmail().withMessage("A valid email address is required"),
];

exports.resetPasswordValidators = [
  body("token").isString().notEmpty().withMessage("Reset token is required"),
  body("password")
    .isString()
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/)
    .withMessage("Password must include uppercase, lowercase, number, and special character"),
  body("confirmPassword").custom((value, { req }) => value === req.body.password).withMessage("Confirm password does not match"),
];

exports.refreshTokenValidators = [
  body("refreshToken").isString().notEmpty().withMessage("Refresh token is required"),
];

exports.signup = async (req, res) => {
  try {
    logger.info("auth.signup.attempt", buildRequestMeta(req));
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

    const user = await User.create({
      name: resolvedName,
      email: payload.email,
      password: payload.password,
      role: "ANALYST",
      status: "ACTIVE",
      isVerified: false,
    });

    const hydratedUser = await UserContextService.provisionCompanyForUser(user, {
      companyName: payload.companyName || payload.company,
    });

    await issueEmailVerificationToken(hydratedUser, "auth.signup");

    return sendSuccess(res, {
      statusCode: 201,
      message: "Verification email sent. Please check your inbox.",
      data: {
        email: hydratedUser.email,
        verificationRequired: true,
      },
    });
  } catch (error) {
    logAuthFailure("auth.signup", error, req);
    const normalizedError = normalizeAuthError(error);
    return sendError(res, {
      statusCode: normalizedError.statusCode,
      message: normalizedError.message,
      errors: normalizedError.errors,
    });
  }
};

exports.login = async (req, res) => {
  try {
    logger.info("auth.login.attempt", buildRequestMeta(req));
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

    if (user.isVerified === false) {
      const error = new Error("Please verify your email before logging in");
      error.statusCode = 403;
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
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logAuthFailure("auth.login", error, req);
    const normalizedError = normalizeAuthError(error);
    return sendError(res, {
      statusCode: normalizedError.statusCode,
      message: normalizedError.message,
      errors: normalizedError.errors,
    });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    ensureDatabaseReady();
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw createValidationError("Validation failed", errors.array());
    }

    const payload = matchedData(req, { locations: ["body"] });
    const tokenHash = crypto.createHash("sha256").update(payload.token).digest("hex");

    const user = await User.scope("withPassword").findOne({
      emailVerificationToken: tokenHash,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      const tokenOwner = await User.scope("withPassword").findOne({
        emailVerificationToken: tokenHash,
      });

      if (tokenOwner && tokenOwner.isVerified === true) {
        return sendError(res, {
          statusCode: 400,
          message: "Already verified",
        });
      }

      if (tokenOwner) {
        return sendError(res, {
          statusCode: 400,
          message: "Token expired",
        });
      }

      return sendError(res, {
        statusCode: 400,
        message: "Token invalid",
      });
    }

    if (user.isVerified === true) {
      return sendError(res, {
        statusCode: 400,
        message: "Already verified",
      });
    }

    user.isVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    void sendWelcomeEmail({
      to: user.email,
      name: user.name,
    }).catch((emailError) => {
      logger.warn("auth.verifyEmail.welcome_email_failed", {
        userId: user.id,
        message: emailError.message,
        stack: env.isProduction ? undefined : emailError.stack,
      });
    });

    return sendSuccess(res, {
      message: "Email verified successfully",
    });
  } catch (error) {
    logAuthFailure("auth.verifyEmail", error, req);
    const normalizedError = normalizeAuthError(error);
    return sendError(res, {
      statusCode: normalizedError.statusCode,
      message: normalizedError.message,
      errors: normalizedError.errors,
    });
  }
};

exports.verifyEmailGet = async (_req, res) => sendError(res, {
  statusCode: 405,
  message: "Use POST /api/auth/verify-email with token in request body",
});

exports.resendVerification = async (req, res) => {
  try {
    ensureDatabaseReady();
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw createValidationError("Validation failed", errors.array());
    }

    const payload = matchedData(req, { locations: ["body"] });
    const user = await User.scope("withPassword").findOne({ email: payload.email });

    if (user && user.isVerified === false) {
      await issueEmailVerificationToken(user, "auth.resendVerification");
    }

    return sendSuccess(res, {
      message: "If an unverified account exists for that email, a new verification email has been sent",
      data: {
        email: payload.email,
      },
    });
  } catch (error) {
    logAuthFailure("auth.resendVerification", error, req);
    const normalizedError = normalizeAuthError(error);
    return sendError(res, {
      statusCode: normalizedError.statusCode,
      message: normalizedError.message,
      errors: normalizedError.errors,
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

      const resetUrl = `${env.frontendUrl}/auth/reset-password?token=${rawToken}`;
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

    if (user.isVerified === false) {
      const error = new Error("Please verify your email before logging in");
      error.statusCode = 403;
      throw error;
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);
    await storeRefreshToken(user, newRefreshToken);

    return sendSuccess(res, {
      message: "Token refreshed successfully",
      data: {
        token: newAccessToken,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
      error.statusCode = 401;
    }
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
