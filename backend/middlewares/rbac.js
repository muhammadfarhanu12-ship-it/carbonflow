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

const PERMISSIONS = [
  "supplier:view",
  "supplier:create",
  "supplier:update",
  "supplier:archive",
  "supplier:score:view",
  "supplier:questionnaire:send",
  "supplier:evidence:view",
  "supplier:evidence:verify",
  "supplier:audit:view",
  "factor:manage",
  "emission:view",
  "emission:create",
  "emission:update",
  "emission:submit",
  "emission:approve",
  "emission:archive",
  "emission:recalculate",
  "ledger:financial:create",
  "ledger:financial:update",
  "audit:view",
  "report:generate",
  "report:view",
  "user:manage",
];

const ROLE_PERMISSIONS = {
  owner: [...PERMISSIONS, "records:create", "records:edit", "records:approve"],
  admin: [...PERMISSIONS, "records:create", "records:edit", "records:approve"],
  manager: [
    "supplier:view",
    "supplier:create",
    "supplier:update",
    "supplier:archive",
    "supplier:score:view",
    "supplier:questionnaire:send",
    "supplier:evidence:view",
    "report:generate",
    "report:view",
    "emission:view",
    "emission:create",
    "emission:update",
    "emission:submit",
    "emission:approve",
    "emission:archive",
    "emission:recalculate",
    "ledger:financial:create",
    "ledger:financial:update",
    "audit:view",
    "records:create",
    "records:edit",
    "records:approve",
  ],
  data_entry: ["supplier:view", "supplier:create", "supplier:update", "supplier:evidence:view", "report:view", "emission:view", "emission:create", "emission:update", "emission:submit", "records:create", "records:edit"],
  viewer: ["supplier:view", "supplier:score:view", "supplier:evidence:view", "report:view", "emission:view"],
  auditor: ["supplier:view", "supplier:score:view", "supplier:evidence:view", "supplier:audit:view", "report:view", "emission:view", "audit:view"],
};

const LEGACY_PERMISSION_ALIASES = {
  "suppliers:view": "supplier:view",
  "suppliers:manage": "supplier:update",
  "suppliers:engage": "supplier:questionnaire:send",
  "audit:view": "supplier:audit:view",
  "factors:manage": "factor:manage",
  "reports:generate": "report:generate",
  "reports:view": "report:view",
  "records:create": "emission:create",
  "records:edit": "emission:update",
  "records:approve": "emission:approve",
};

const CUSTOM_POLICY_DEFAULTS = {
  customRoles: {},
  departmentAccess: [],
  regionAccess: [],
  fieldRestrictions: {},
  supplierCategoryRestrictions: [],
};

function normalizeRole(role) {
  const key = String(role || "").trim().toUpperCase();
  return ROLE_ALIASES[key] || key.toLowerCase();
}

function normalizePermission(permission) {
  const normalized = String(permission || "").trim();
  return LEGACY_PERMISSION_ALIASES[normalized] || normalized;
}

function resolveUserPermissions(user) {
  const role = normalizeRole(user?.role);
  const rolePermissions = ROLE_PERMISSIONS[role] || [];
  const customPermissions = Array.isArray(user?.permissions) ? user.permissions : [];
  return [...new Set([...rolePermissions, ...customPermissions].map(normalizePermission))];
}

function hasPermission(user, permission) {
  return resolveUserPermissions(user).includes(normalizePermission(permission));
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
  CUSTOM_POLICY_DEFAULTS,
  LEGACY_PERMISSION_ALIASES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  normalizeRole,
  normalizePermission,
  requirePermission,
  resolveUserPermissions,
};
