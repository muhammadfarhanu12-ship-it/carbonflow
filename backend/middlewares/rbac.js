const ApiError = require("../utils/ApiError");

const ROLE_ALIASES = {
  SUPERADMIN: "owner",
  ADMIN: "admin",
  MANAGER: "manager",
  ANALYST: "auditor",
  USER: "data_entry",
  OWNER: "owner",
  DATA_ENTRY: "data_entry",
  VIEWER: "viewer",
  AUDITOR: "auditor",
};

const ROLE_PERMISSIONS = {
  owner: ["records:create", "records:edit", "records:approve", "factors:manage", "reports:generate", "reports:view", "audit:view"],
  admin: ["records:create", "records:edit", "records:approve", "factors:manage", "reports:generate", "reports:view", "audit:view"],
  manager: ["records:create", "records:edit", "records:approve", "reports:generate", "reports:view"],
  data_entry: ["records:create", "records:edit", "reports:view"],
  viewer: ["reports:view"],
  auditor: ["reports:view", "audit:view"],
};

function normalizeRole(role) {
  const key = String(role || "").trim().toUpperCase();
  return ROLE_ALIASES[key] || key.toLowerCase();
}

function hasPermission(user, permission) {
  const role = normalizeRole(user?.role);
  return Boolean(ROLE_PERMISSIONS[role]?.includes(permission));
}

function requirePermission(permission) {
  return (req, _res, next) => {
    if (!hasPermission(req.user, permission)) {
      return next(new ApiError(403, `Permission denied: ${permission}`));
    }

    return next();
  };
}

module.exports = {
  ROLE_PERMISSIONS,
  hasPermission,
  normalizeRole,
  requirePermission,
};
