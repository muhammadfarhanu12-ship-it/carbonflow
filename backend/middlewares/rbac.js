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
  "factor:view",
  "factor:manage",
  "factor:import",
  "factor:audit:view",
  "shipment:create",
  "import:view",
  "import:create",
  "import:commit",
  "import:error_report:download",
  "import:review",
  "approvals:view",
  "approvals:assign",
  "approvals:bulk_action",
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
  "audit:export",
  "audit:admin",
  "report:generate",
  "report:view",
  "report:download",
  "report:archive",
  "report:regenerate",
  "report:custom_extract",
  "optimization:view",
  "optimization:run",
  "optimization:update",
  "optimization:export",
  "marketplace:view",
  "marketplace:manage",
  "marketplace:checkout",
  "marketplace:budget:request",
  "marketplace:budget:manage",
  "marketplace:payment:verify",
  "marketplace:registry:verify",
  "marketplace:certificate:view",
  "marketplace:auto_offset:manage",
  "settings:view",
  "settings:profile:update",
  "settings:organization:update",
  "settings:emissions:update",
  "settings:team:manage",
  "settings:security:update",
  "settings:api_keys:manage",
  "settings:integrations:manage",
  "user:manage",
  "factor:approve",
  "report:approve",
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
    "supplier:evidence:verify",
    "factor:view",
    "factor:manage",
    "factor:import",
    "factor:audit:view",
    "shipment:create",
    "import:view",
    "import:create",
    "import:commit",
    "import:error_report:download",
    "import:review",
    "approvals:view",
    "approvals:assign",
    "report:generate",
    "report:view",
    "report:download",
    "report:regenerate",
    "report:custom_extract",
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
    "audit:export",
    "records:create",
    "records:edit",
    "records:approve",
    "optimization:view",
    "optimization:run",
    "optimization:update",
    "optimization:export",
    "marketplace:view",
    "marketplace:checkout",
    "marketplace:budget:request",
    "marketplace:auto_offset:manage",
    "settings:view",
    "settings:profile:update",
    "settings:organization:update",
    "settings:emissions:update",
    "settings:team:manage",
    "settings:security:update",
    "settings:api_keys:manage",
    "settings:integrations:manage",
    "marketplace:payment:verify",
    "marketplace:registry:verify",
    "factor:approve",
  ],
  data_entry: ["supplier:view", "supplier:create", "supplier:update", "supplier:evidence:view", "shipment:create", "report:view", "emission:view", "emission:create", "emission:update", "emission:submit", "import:view", "import:create", "import:commit", "records:create", "records:edit", "optimization:view", "marketplace:view", "settings:view", "settings:profile:update", "settings:security:update"],
  viewer: ["supplier:view", "supplier:score:view", "supplier:evidence:view", "report:view", "emission:view", "factor:view", "import:view", "optimization:view", "marketplace:view", "settings:view"],
  auditor: ["supplier:view", "supplier:score:view", "supplier:evidence:view", "supplier:audit:view", "report:view", "report:download", "emission:view", "factor:view", "import:view", "approvals:view", "audit:view", "audit:export", "optimization:view", "marketplace:view", "marketplace:certificate:view", "settings:view"],
};

const LEGACY_PERMISSION_ALIASES = {
  "suppliers:view": "supplier:view",
  "suppliers:manage": "supplier:update",
  "suppliers:engage": "supplier:questionnaire:send",
  "audit:logs:view": "audit:view",
  "factors:manage": "factor:manage",
  "factors:view": "factor:view",
  "reports:generate": "report:generate",
  "reports:view": "report:view",
  "reports:download": "report:download",
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

function requireAnyPermission(permissions = []) {
  return (req, _res, next) => {
    if (!permissions.some((permission) => hasPermission(req.user, permission))) {
      return next(new ApiError(403, `Permission denied: ${permissions.join(" or ")}`));
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
  requireAnyPermission,
  resolveUserPermissions,
};
