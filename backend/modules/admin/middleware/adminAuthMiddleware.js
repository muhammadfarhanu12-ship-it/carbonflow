const jwt = require("jsonwebtoken");
const { User } = require("../../../models");
const env = require("../../../config/env");
const ApiError = require("../../../utils/ApiError");
const {
  hasAdminPermission,
  isPlatformAdmin,
  normalizeAdminRole,
  normalizeAdminStatus,
} = require("../adminAccess");

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

async function resolveAdminFromToken(token) {
  const decoded = jwt.verify(token, env.admin.jwtSecret);

  if (decoded.type !== "admin") {
    throw new ApiError(401, "Invalid admin token");
  }

  const admin = await User.findById(decoded.sub);

  if (!admin) {
    throw new ApiError(401, "Admin account not found");
  }

  if (!isPlatformAdmin(admin)) {
    throw new ApiError(403, "This account does not have admin panel access.");
  }

  if (normalizeAdminStatus(admin.adminStatus) !== "active") {
    throw new ApiError(403, "Admin account is disabled");
  }

  return admin;
}

async function verifyAdminToken(req, _res, next) {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      throw new ApiError(401, "Admin authentication token is required");
    }

    req.admin = await resolveAdminFromToken(token);
    next();
  } catch (error) {
    next(error);
  }
}

function requirePlatformAdmin(req, _res, next) {
  if (!isPlatformAdmin(req.admin)) {
    next(new ApiError(403, "This account does not have admin panel access."));
    return;
  }

  if (normalizeAdminStatus(req.admin.adminStatus) !== "active") {
    next(new ApiError(403, "Admin account is disabled"));
    return;
  }

  next();
}

function requireAdminRole(...roles) {
  const allowedRoles = roles.map((role) => normalizeAdminRole(role)).filter(Boolean);

  return (req, _res, next) => {
    const adminRole = normalizeAdminRole(req.admin?.adminRole);

    if (!adminRole || !allowedRoles.includes(adminRole)) {
      next(new ApiError(403, "You do not have permission to access this admin resource"));
      return;
    }

    next();
  };
}

function requireAdminPermission(permission) {
  return (req, _res, next) => {
    if (!hasAdminPermission(req.admin, permission)) {
      next(new ApiError(403, `Permission denied: ${permission}`));
      return;
    }

    next();
  };
}

module.exports = {
  requireAdminPermission,
  requireAdminRole,
  requirePlatformAdmin,
  resolveAdminFromToken,
  verifyAdminToken,
};
