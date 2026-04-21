const jwt = require("jsonwebtoken");
const { Admin } = require("../../../models");
const env = require("../../../config/env");
const ApiError = require("../../../utils/ApiError");

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

async function resolveAdminFromToken(token) {
  const decoded = jwt.verify(token, env.admin.jwtSecret);

  if (decoded.type !== "admin") {
    throw new ApiError(401, "Invalid admin token");
  }

  const admin = await Admin.findById(decoded.sub);

  if (!admin) {
    throw new ApiError(401, "Admin account not found");
  }

  if (admin.status !== "active") {
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

async function optionalAdminToken(req, _res, next) {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      next();
      return;
    }

    req.admin = await resolveAdminFromToken(token);
    next();
  } catch (error) {
    next(error);
  }
}

function requireAdminRole(...roles) {
  const allowedRoles = roles.map((role) => String(role).toLowerCase());

  return (req, _res, next) => {
    const adminRole = String(req.admin?.role || "").toLowerCase();

    if (!adminRole || !allowedRoles.includes(adminRole)) {
      next(new ApiError(403, "You do not have permission to access this admin resource"));
      return;
    }

    next();
  };
}

module.exports = {
  verifyAdminToken,
  optionalAdminToken,
  requireAdminRole,
  resolveAdminFromToken,
};
