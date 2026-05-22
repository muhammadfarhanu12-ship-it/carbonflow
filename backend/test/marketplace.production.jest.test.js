const { hasPermission } = require("../middlewares/rbac");
const { OFFSET_PROJECT_STATUSES, OFFSET_TRANSACTION_STATUSES } = require("../constants/platform");

describe("marketplace production guardrails", () => {
  test("marketplace lifecycle supports production states", () => {
    expect(OFFSET_PROJECT_STATUSES).toEqual(expect.arrayContaining([
      "DRAFT",
      "PENDING_REVIEW",
      "PUBLISHED",
      "PAUSED",
      "SOLD_OUT",
      "ARCHIVED",
    ]));
  });

  test("transaction lifecycle supports reservation and cancellation states", () => {
    expect(OFFSET_TRANSACTION_STATUSES).toEqual(expect.arrayContaining([
      "PENDING",
      "RESERVED",
      "COMPLETED",
      "FAILED",
      "CANCELLED",
      "REFUNDED",
    ]));
  });

  test("RBAC allows marketplace management only for elevated roles", () => {
    expect(hasPermission({ role: "ADMIN" }, "marketplace:manage")).toBe(true);
    expect(hasPermission({ role: "MANAGER" }, "marketplace:checkout")).toBe(true);
    expect(hasPermission({ role: "VIEWER" }, "marketplace:view")).toBe(true);
    expect(hasPermission({ role: "VIEWER" }, "marketplace:manage")).toBe(false);
    expect(hasPermission({ role: "AUDITOR" }, "marketplace:checkout")).toBe(false);
  });

  test("budget and certificate permissions are scoped by role", () => {
    expect(hasPermission({ role: "ADMIN" }, "marketplace:budget:manage")).toBe(true);
    expect(hasPermission({ role: "MANAGER" }, "marketplace:budget:request")).toBe(true);
    expect(hasPermission({ role: "AUDITOR" }, "marketplace:certificate:view")).toBe(true);
    expect(hasPermission({ role: "VIEWER" }, "marketplace:certificate:view")).toBe(false);
  });
});
