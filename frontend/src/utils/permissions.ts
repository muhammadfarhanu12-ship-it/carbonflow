import type { SessionUser } from "@/src/types/platform";

export type Permission =
  | "supplier:view"
  | "supplier:create"
  | "supplier:update"
  | "supplier:archive"
  | "supplier:score:view"
  | "supplier:questionnaire:send"
  | "supplier:evidence:view"
  | "supplier:evidence:verify"
  | "supplier:audit:view"
  | "factor:view"
  | "factor:manage"
  | "factor:import"
  | "factor:audit:view"
  | "shipment:view"
  | "shipment:create"
  | "shipment:update"
  | "shipment:archive"
  | "shipment:import"
  | "shipment:recalculate"
  | "shipment:link_supplier"
  | "shipment:create_ledger_record"
  | "import:view"
  | "import:create"
  | "import:commit"
  | "import:error_report:download"
  | "import:review"
  | "approvals:view"
  | "approvals:assign"
  | "approvals:bulk_action"
  | "emission:view"
  | "emission:create"
  | "emission:update"
  | "emission:submit"
  | "emission:approve"
  | "emission:archive"
  | "emission:recalculate"
  | "ledger:financial:create"
  | "ledger:financial:update"
  | "audit:view"
  | "audit:export"
  | "report:generate"
  | "report:view"
  | "report:download"
  | "report:archive"
  | "report:regenerate"
  | "report:custom_extract"
  | "optimization:view"
  | "optimization:run"
  | "marketplace:view"
  | "marketplace:checkout"
  | "marketplace:budget:manage"
  | "marketplace:payment:verify"
  | "marketplace:registry:verify"
  | "settings:view"
  | "settings:profile:update"
  | "settings:organization:update"
  | "settings:emissions:update"
  | "settings:team:manage"
  | "settings:security:update"
  | "settings:api_keys:manage"
  | "settings:integrations:manage"
  | "user:manage"
  | "factor:approve"
  | "report:approve";

const ROLE_ALIASES: Record<string, string> = {
  SUPERADMIN: "owner",
  OWNER: "owner",
  ADMIN: "admin",
  MANAGER: "manager",
  USER: "data_entry",
  DATA_ENTRY: "data_entry",
  ANALYST: "auditor",
  AUDITOR: "auditor",
  VIEWER: "viewer",
};

const ALL_PERMISSIONS: Permission[] = [
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
  "shipment:view",
  "shipment:create",
  "shipment:update",
  "shipment:archive",
  "shipment:import",
  "shipment:recalculate",
  "shipment:link_supplier",
  "shipment:create_ledger_record",
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
  "report:generate",
  "report:view",
  "report:download",
  "report:archive",
  "report:regenerate",
  "report:custom_extract",
  "optimization:view",
  "optimization:run",
  "marketplace:view",
  "marketplace:checkout",
  "marketplace:budget:manage",
  "marketplace:payment:verify",
  "marketplace:registry:verify",
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

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
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
    "shipment:view",
    "shipment:create",
    "shipment:update",
    "shipment:archive",
    "shipment:import",
    "shipment:recalculate",
    "shipment:link_supplier",
    "shipment:create_ledger_record",
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
    "optimization:view",
    "optimization:run",
    "marketplace:view",
    "marketplace:checkout",
    "marketplace:budget:manage",
    "marketplace:payment:verify",
    "marketplace:registry:verify",
    "factor:approve",
    "settings:view",
    "settings:profile:update",
    "settings:organization:update",
    "settings:emissions:update",
    "settings:security:update",
  ],
  data_entry: ["supplier:view", "supplier:create", "supplier:update", "supplier:evidence:view", "shipment:view", "shipment:create", "shipment:update", "shipment:import", "shipment:recalculate", "shipment:link_supplier", "report:view", "emission:view", "emission:create", "emission:update", "emission:submit", "import:view", "import:create", "import:commit", "optimization:view", "marketplace:view", "settings:view", "settings:profile:update", "settings:security:update"],
  viewer: ["supplier:view", "supplier:score:view", "supplier:evidence:view", "shipment:view", "report:view", "emission:view", "factor:view", "import:view", "optimization:view", "marketplace:view", "settings:view"],
  auditor: ["supplier:view", "supplier:score:view", "supplier:evidence:view", "supplier:audit:view", "factor:audit:view", "shipment:view", "report:view", "report:download", "emission:view", "factor:view", "import:view", "approvals:view", "audit:view", "audit:export", "optimization:view", "marketplace:view", "settings:view"],
};

export const NO_PERMISSION_MESSAGE = "You do not have permission to perform this action.";

export function normalizeRole(role?: string | null) {
  const key = String(role || "").trim().toUpperCase();
  return ROLE_ALIASES[key] || key.toLowerCase();
}

export function hasPermission(user: SessionUser | null | undefined, permission: Permission) {
  const role = normalizeRole(user?.role);
  const customPermissions = Array.isArray((user as SessionUser & { permissions?: string[] } | null | undefined)?.permissions)
    ? ((user as SessionUser & { permissions?: string[] }).permissions || [])
    : [];
  return Boolean(ROLE_PERMISSIONS[role]?.includes(permission) || customPermissions.includes(permission));
}
