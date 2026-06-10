const mockUserCountDocuments = jest.fn();
const mockUserFindOne = jest.fn();
const mockUserFindById = jest.fn();
const mockUserCreate = jest.fn();
const mockCompanyCreate = jest.fn();
const mockSettingCreate = jest.fn();
const mockAuditLog = jest.fn();
const mockSyncOperationalRecords = jest.fn();

jest.mock("../models", () => ({
  User: {
    countDocuments: (...args) => mockUserCountDocuments(...args),
    findOne: (...args) => mockUserFindOne(...args),
    findById: (...args) => mockUserFindById(...args),
    create: (...args) => mockUserCreate(...args),
  },
  Company: {
    create: (...args) => mockCompanyCreate(...args),
  },
  Setting: {
    create: (...args) => mockSettingCreate(...args),
    findOne: jest.fn(),
  },
}));

jest.mock("../services/audit.service", () => ({
  log: (...args) => mockAuditLog(...args),
}));

jest.mock("../services/emissionRecord.service", () => ({
  syncOperationalRecords: (...args) => mockSyncOperationalRecords(...args),
}));

const UserContextService = require("../services/userContext.service");
const UserService = require("../services/user.service");
const { resolveUserPermissions } = require("../middlewares/rbac");

function buildUser(overrides = {}) {
  return {
    id: "user-1",
    _id: "user-1",
    companyId: "company-1",
    name: "Owner User",
    email: "owner@example.com",
    role: "ANALYST",
    status: "ACTIVE",
    isVerified: true,
    save: jest.fn(async function save() { return this; }),
    reload: jest.fn(async function reload() { return this; }),
    ...overrides,
  };
}

function mockFindOneResult(value) {
  return {
    select: jest.fn().mockResolvedValue(value),
    populate: jest.fn().mockResolvedValue(value),
  };
}

function mockFindByIdResult(value) {
  return {
    populate: jest.fn().mockResolvedValue(value),
  };
}

describe("workspace ownership and team RBAC", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuditLog.mockResolvedValue({});
    mockSyncOperationalRecords.mockResolvedValue(undefined);
  });

  test("first workspace user is bootstrapped as owner", async () => {
    const user = buildUser({ companyId: null, role: "ANALYST" });
    mockCompanyCreate.mockResolvedValue({
      id: "company-1",
      name: "Acme Carbon",
      industry: "General",
      region: "GLOBAL",
      currency: "USD",
      revenueUsd: 1000000,
      annualShipmentWeightKg: 0,
      carbonTargetYear: 2040,
      carbonPricePerTon: 55,
    });
    mockSettingCreate.mockResolvedValue({ id: "settings-1" });

    await UserContextService.provisionCompanyForUser(user, { companyName: "Acme Carbon" });

    expect(user.companyId).toBe("company-1");
    expect(user.role).toBe("OWNER");
    expect(user.save).toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "owner_bootstrapped",
      entityId: "user-1",
    }));
  });

  test("second user invitation does not automatically become owner", async () => {
    const requester = buildUser({ id: "owner-1", role: "OWNER", companyId: "company-1", email: "owner@example.com" });
    const createdUser = buildUser({ id: "user-2", role: "MANAGER", companyId: "company-1", email: "manager@example.com", status: "INVITED" });
    mockUserFindOne.mockResolvedValueOnce(null);
    mockUserCreate.mockResolvedValue(createdUser);
    mockUserFindById.mockReturnValue(mockFindByIdResult(createdUser));

    const response = await UserService.inviteUser({
      name: "Manager User",
      email: "manager@example.com",
      role: "MANAGER",
    }, requester);

    expect(response.role).toBe("MANAGER");
    expect(response.companyId).toBe("company-1");
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "user_invited",
    }));
  });

  test("cannot demote the last workspace owner", async () => {
    const requester = buildUser({ id: "owner-1", role: "OWNER", companyId: "company-1" });
    const managedUser = buildUser({ id: "owner-1", role: "OWNER", companyId: "company-1" });
    mockUserFindOne.mockReturnValue(mockFindOneResult(managedUser));
    mockUserCountDocuments.mockResolvedValue(0);

    await expect(UserService.updateUserRole("owner-1", "ADMIN", requester))
      .rejects.toThrow(/last workspace owner/i);
  });

  test("cannot edit users from another company", async () => {
    const requester = buildUser({ id: "owner-1", role: "OWNER", companyId: "company-1" });
    mockUserFindOne.mockReturnValue(mockFindOneResult(null));

    await expect(UserService.updateUserStatus("user-2", "SUSPENDED", requester))
      .rejects.toThrow(/user not found/i);
  });

  test("owner and admin receive required management permissions", () => {
    const ownerPermissions = resolveUserPermissions({ role: "OWNER" });
    const adminPermissions = resolveUserPermissions({ role: "ADMIN" });

    [
      "user:manage",
      "settings:team:manage",
      "report:generate",
      "factor:manage",
      "import:create",
      "import:commit",
      "approvals:view",
      "shipment:import",
      "audit:view",
    ].forEach((permission) => {
      expect(ownerPermissions).toContain(permission);
      expect(adminPermissions).toContain(permission);
    });
  });

  test("viewer and data entry roles cannot manage workspace users", () => {
    expect(resolveUserPermissions({ role: "VIEWER" })).not.toContain("user:manage");
    expect(resolveUserPermissions({ role: "DATA_ENTRY" })).not.toContain("user:manage");
    expect(resolveUserPermissions({ role: "VIEWER" })).not.toContain("settings:team:manage");
    expect(resolveUserPermissions({ role: "DATA_ENTRY" })).not.toContain("settings:team:manage");
  });
});
