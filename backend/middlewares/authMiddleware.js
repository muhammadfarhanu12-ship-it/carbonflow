const jwt = require("jsonwebtoken");
const { User } = require("../models");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const UserContextService = require("../services/userContext.service");
const logger = require("../utils/logger");

const UNAUTHORIZED_MESSAGE = "Unauthorized: Invalid or missing token";

function getAuthorizationScheme(authHeader = "") {
  return String(authHeader).trim().split(/\s+/)[0] || null;
}

function extractBearerToken(authHeader = "") {
  const parts = String(authHeader).trim().split(/\s+/).filter(Boolean);

  if (parts.length !== 2) {
    return null;
  }

  const [scheme, token] = parts;

  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token;
}

function logAuthFailure(req, reason, statusCode = 401) {
  logger.warn("auth.request_denied", {
    statusCode,
    reason,
    method: req.method,
    path: req.originalUrl,
    hasAuthorizationHeader: Boolean(req.headers.authorization),
    authorizationScheme: getAuthorizationScheme(req.headers.authorization),
  });
}

async function resolveUserFromToken(token) {
  const decoded = jwt.verify(token, env.auth.jwtSecret);
  const userId = decoded?.sub || decoded?.id;

  if (!userId) {
    throw new ApiError(401, UNAUTHORIZED_MESSAGE);
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(401, UNAUTHORIZED_MESSAGE);
  }

  if (user.status === "SUSPENDED") {
    throw new ApiError(403, "Your account has been suspended");
  }

  if (user.isVerified === false) {
    throw new ApiError(403, "Please verify your email before accessing the dashboard");
  }

  const scopedUser = await UserContextService.ensureCompanyContext(user);

  return { decoded, user: scopedUser };
}

async function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    logAuthFailure(req, "missing_authorization_header");
    return next(new ApiError(401, UNAUTHORIZED_MESSAGE));
  }

  const token = extractBearerToken(authHeader);

  if (!token) {
    logAuthFailure(req, "malformed_authorization_header");
    return next(new ApiError(401, UNAUTHORIZED_MESSAGE));
  }

  try {
    const { decoded, user } = await resolveUserFromToken(token);
    req.auth = decoded;
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      logAuthFailure(req, "token_expired");
      return next(new ApiError(401, "Unauthorized: Token expired"));
    }

    if (error.name === "JsonWebTokenError") {
      logAuthFailure(req, "token_invalid");
      return next(new ApiError(401, UNAUTHORIZED_MESSAGE));
    }

    return next(error);
  }
}

function authorize(...roles) {
  const allowedRoles = roles.map((role) => String(role).toUpperCase());

  return (req, _res, next) => {
    const userRole = String(req.user?.role || "").toUpperCase();

    if (!userRole || !allowedRoles.includes(userRole)) {
      return next(new ApiError(403, "You do not have permission to access this resource"));
    }

    return next();
  };
}

module.exports = {
  authenticate,
  authorize,
  resolveUserFromToken,
};
