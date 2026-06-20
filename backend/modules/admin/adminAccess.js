const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "SUPPORT"];
const ADMIN_STATUSES = ["active", "disabled"];

const ADMIN_PERMISSION_MAP = {
  SUPER_ADMIN: [
    "admin",
    "admin:users",
    "admin:companies",
    "admin:plans",
    "admin:factors",
    "admin:audit",
    "admin:settings",
  ],
  ADMIN: [
    "admin",
    "admin:users",
    "admin:companies",
    "admin:audit",
  ],
  SUPPORT: [
    "admin",
    "admin:users",
    "admin:companies",
  ],
};

function normalizeAdminRole(role) {
  const normalized = String(role || "").trim().toUpperCase();
  return ADMIN_ROLES.includes(normalized) ? normalized : null;
}

function normalizeAdminStatus(status) {
  const normalized = String(status || "active").trim().toLowerCase();
  return ADMIN_STATUSES.includes(normalized) ? normalized : "active";
}

function getAdminPermissionsForRole(role) {
  const normalizedRole = normalizeAdminRole(role);
  return normalizedRole ? [...ADMIN_PERMISSION_MAP[normalizedRole]] : [];
}

function isPlatformAdmin(user) {
  return Boolean(user?.isPlatformAdmin) && Boolean(normalizeAdminRole(user?.adminRole));
}

function resolveAdminPermissions(user) {
  if (!isPlatformAdmin(user)) {
    return [];
  }

  const explicitPermissions = Array.isArray(user?.adminPermissions)
    ? user.adminPermissions.filter(Boolean)
    : [];

  return explicitPermissions.length > 0
    ? [...new Set(explicitPermissions)]
    : getAdminPermissionsForRole(user.adminRole);
}

function hasAdminPermission(user, permission) {
  return resolveAdminPermissions(user).includes(String(permission || "").trim());
}

function toAdminSessionUser(user) {
  const adminRole = normalizeAdminRole(user?.adminRole);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: adminRole,
    adminRole,
    adminPermissions: resolveAdminPermissions(user),
    adminStatus: normalizeAdminStatus(user?.adminStatus),
    forcePasswordChange: Boolean(user?.forcePasswordChange),
    lastLoginAt: user?.adminLastLoginAt || user?.lastLoginAt || null,
    createdAt: user?.createdAt || null,
    updatedAt: user?.updatedAt || null,
  };
}

module.exports = {
  ADMIN_PERMISSION_MAP,
  ADMIN_ROLES,
  ADMIN_STATUSES,
  getAdminPermissionsForRole,
  hasAdminPermission,
  isPlatformAdmin,
  normalizeAdminRole,
  normalizeAdminStatus,
  resolveAdminPermissions,
  toAdminSessionUser,
};
