const { CUSTOM_POLICY_DEFAULTS, hasPermission, resolveUserPermissions } = require("../middlewares/rbac");

describe("supplier RBAC permissions", () => {
  test("viewer cannot edit supplier", () => {
    expect(hasPermission({ role: "VIEWER" }, "supplier:view")).toBe(true);
    expect(hasPermission({ role: "VIEWER" }, "supplier:update")).toBe(false);
  });

  test("manager can send questionnaire", () => {
    expect(hasPermission({ role: "MANAGER" }, "supplier:questionnaire:send")).toBe(true);
  });

  test("auditor can view audit logs but not edit", () => {
    expect(hasPermission({ role: "AUDITOR" }, "supplier:audit:view")).toBe(true);
    expect(hasPermission({ role: "AUDITOR" }, "supplier:update")).toBe(false);
  });

  test("data_entry cannot verify evidence", () => {
    expect(hasPermission({ role: "DATA_ENTRY" }, "supplier:evidence:view")).toBe(true);
    expect(hasPermission({ role: "DATA_ENTRY" }, "supplier:evidence:verify")).toBe(false);
  });

  test("admin can manage suppliers", () => {
    expect(hasPermission({ role: "ADMIN" }, "supplier:create")).toBe(true);
    expect(hasPermission({ role: "ADMIN" }, "supplier:update")).toBe(true);
    expect(hasPermission({ role: "ADMIN" }, "supplier:archive")).toBe(true);
  });

  test("owner can manage everything", () => {
    expect(resolveUserPermissions({ role: "OWNER" })).toEqual(expect.arrayContaining([
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
      "report:generate",
      "user:manage",
    ]));
  });

  test("keeps legacy permission aliases working", () => {
    expect(hasPermission({ role: "ADMIN" }, "suppliers:manage")).toBe(true);
    expect(hasPermission({ role: "AUDITOR" }, "audit:view")).toBe(true);
  });

  test("exposes custom policy readiness structure", () => {
    expect(CUSTOM_POLICY_DEFAULTS).toEqual(expect.objectContaining({
      customRoles: {},
      departmentAccess: [],
      regionAccess: [],
      fieldRestrictions: {},
      supplierCategoryRestrictions: [],
    }));
  });
});
