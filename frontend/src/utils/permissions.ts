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
  | "factor:manage"
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
  | "report:generate"
  | "report:view"
  | "user:manage";

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
  ],
  data_entry: ["supplier:view", "supplier:create", "supplier:update", "supplier:evidence:view", "report:view", "emission:view", "emission:create", "emission:update", "emission:submit"],
  viewer: ["supplier:view", "supplier:score:view", "supplier:evidence:view", "report:view", "emission:view"],
  auditor: ["supplier:view", "supplier:score:view", "supplier:evidence:view", "supplier:audit:view", "report:view", "emission:view", "audit:view"],
};

export const NO_PERMISSION_MESSAGE = "You do not have permission to perform this action.";

export function normalizeRole(role?: string | null) {
  const key = String(role || "").trim().toUpperCase();
  return ROLE_ALIASES[key] || key.toLowerCase();
}

export function hasPermission(user: SessionUser | null | undefined, permission: Permission) {
  const role = normalizeRole(user?.role);
  return Boolean(ROLE_PERMISSIONS[role]?.includes(permission));
}
