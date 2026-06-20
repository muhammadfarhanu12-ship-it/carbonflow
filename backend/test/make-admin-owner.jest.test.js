const { makeAdminOwner, parseArgs } = require("../scripts/make-admin-owner");

describe("make-admin-owner script", () => {
  test("promotes only the selected email", async () => {
    const targetUser = {
      email: "owner@example.com",
      adminRole: null,
      adminStatus: "disabled",
      adminCreatedAt: null,
      isVerified: false,
      save: jest.fn(async function save() { return this; }),
    };

    const result = await makeAdminOwner({ email: "owner@example.com" }, {
      connectDB: jest.fn(async () => undefined),
      closeDB: jest.fn(async () => undefined),
      UserModel: {
        findOne: jest.fn(async (filter) => (filter.email === "owner@example.com" ? targetUser : null)),
        create: jest.fn(),
      },
      now: () => new Date("2026-06-11T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      email: "owner@example.com",
      newAdminRole: "SUPER_ADMIN",
      adminStatus: "active",
      created: false,
      promoted: true,
    });
    expect(targetUser.save).toHaveBeenCalledTimes(1);
    expect(targetUser.isPlatformAdmin).toBe(true);
    expect(targetUser.adminPermissions).toContain("admin:settings");
  });

  test("creates a new SUPER_ADMIN only when --create is requested", async () => {
    const createdUsers = [];

    const result = await makeAdminOwner({
      email: "new-owner@example.com",
      create: true,
      password: "AnotherStrongPass1!",
    }, {
      connectDB: jest.fn(async () => undefined),
      closeDB: jest.fn(async () => undefined),
      UserModel: {
        findOne: jest.fn(async () => null),
        create: jest.fn(async (payload) => {
          createdUsers.push(payload);
          return payload;
        }),
      },
      now: () => new Date("2026-06-11T00:00:00.000Z"),
    });

    expect(result.created).toBe(true);
    expect(createdUsers).toHaveLength(1);
    expect(createdUsers[0]).toMatchObject({
      email: "new-owner@example.com",
      isPlatformAdmin: true,
      adminRole: "SUPER_ADMIN",
      adminStatus: "active",
      forcePasswordChange: true,
    });
  });

  test("does not promote all users", async () => {
    const findOne = jest.fn(async (filter) => {
      expect(filter).toEqual({ email: "only-this@example.com" });
      return {
        email: "only-this@example.com",
        adminRole: null,
        adminStatus: "active",
        adminCreatedAt: null,
        save: jest.fn(async function save() { return this; }),
      };
    });

    await makeAdminOwner({ email: "only-this@example.com" }, {
      connectDB: jest.fn(async () => undefined),
      closeDB: jest.fn(async () => undefined),
      UserModel: { findOne, create: jest.fn() },
      now: () => new Date("2026-06-11T00:00:00.000Z"),
    });

    expect(findOne).toHaveBeenCalledTimes(1);
  });

  test("parseArgs reads create flow without exposing password defaults", () => {
    const parsed = parseArgs([
      "--email=owner@example.com",
      "--create",
      "--password=StrongPass1!",
      "--role=admin",
    ]);

    expect(parsed).toEqual({
      email: "owner@example.com",
      password: "StrongPass1!",
      create: true,
      role: "ADMIN",
    });
  });
});
