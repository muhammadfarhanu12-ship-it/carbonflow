const SettingsService = require("../services/settings.service");
const AuditService = require("../services/audit.service");
const UserContextService = require("../services/userContext.service");
const { Company, Setting, User } = require("../models");

function buildSettings(overrides = {}) {
  return {
    id: "settings-1",
    companyId: "company-1",
    companyName: "Acme Carbon",
    industry: "Logistics",
    region: "GLOBAL",
    currency: "USD",
    carbonPricePerTon: 55,
    netZeroTargetYear: 2040,
    operationalMetrics: {},
    emissionFactorOverrides: { transport: {}, electricity: {}, fuels: {}, fleet: {} },
    emissionFactorOverrideMetadata: {},
    integrations: [],
    apiKeys: [],
    notificationsEnabled: true,
    securityAlertsEnabled: true,
    update: jest.fn(function update(payload) {
      Object.assign(this, payload);
      return Promise.resolve(this);
    }),
    ...overrides,
  };
}

describe("settings production controls", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("API key creation stores hash only and returns full value once", async () => {
    const settings = buildSettings();
    const user = { id: "admin-1", email: "admin@example.com", role: "ADMIN", companyId: "company-1", name: "Admin" };
    jest.spyOn(User, "findByPk").mockResolvedValue(user);
    jest.spyOn(UserContextService, "ensureCompanyContext").mockResolvedValue(user);
    jest.spyOn(Setting, "findOne").mockResolvedValue(settings);
    jest.spyOn(Company, "findByPk").mockResolvedValue({ id: "company-1", update: jest.fn() });
    jest.spyOn(AuditService, "log").mockResolvedValue({});

    const response = await SettingsService.createApiKey(user, {
      label: "Reporting key",
      scopes: ["reports:read"],
    });

    expect(response.oneTimeApiKey).toMatch(/^cf_/);
    expect(settings.update).toHaveBeenCalledWith(expect.objectContaining({
      apiKeys: [expect.objectContaining({
        label: "Reporting key",
        keyHash: expect.any(String),
        maskedKey: expect.stringContaining("cf_"),
      })],
    }));
    expect(settings.update.mock.calls[0][0].apiKeys[0]).not.toHaveProperty("key");
    expect(settings.update.mock.calls[0][0].apiKeys[0]).not.toHaveProperty("plaintextKey");
    expect(response.apiKeys[0].key).toContain("••••");
    expect(response.apiKeys[0].key).not.toBe(response.oneTimeApiKey);
  });

  test("factor override governance requires documented source metadata", () => {
    expect(() => SettingsService.validateEmissionFactorOverrides({
      transport: { ROAD: 0.12 },
    }, {})).toThrow("Factor overrides require source name");

    expect(SettingsService.validateEmissionFactorOverrides({
      transport: { ROAD: 0.12 },
    }, {
      sourceName: "Official inventory",
      sourceYear: 2026,
      unit: "kgCO2e/t-km",
      region: "GLOBAL",
      reason: "Contract-specific factor",
    })).toEqual({ transport: { ROAD: 0.12 } });
  });

  test("unconfigured integration sync fails honestly and does not mark connected", async () => {
    const settings = buildSettings();
    const user = { id: "admin-1", email: "admin@example.com", role: "ADMIN", companyId: "company-1", name: "Admin" };
    jest.spyOn(User, "findByPk").mockResolvedValue(user);
    jest.spyOn(UserContextService, "ensureCompanyContext").mockResolvedValue(user);
    jest.spyOn(Setting, "findOne").mockResolvedValue(settings);
    jest.spyOn(Company, "findByPk").mockResolvedValue({ id: "company-1" });
    jest.spyOn(AuditService, "log").mockResolvedValue({});

    const response = await SettingsService.syncIntegration(user, "ERP Feed");

    const erp = response.integrations.find((integration) => integration.name === "ERP Feed");
    expect(erp.status).toBe("not_configured");
    expect(erp.lastError).toMatch(/not configured/i);
    expect(AuditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: "integration_sync_failed",
      status: "failed",
    }));
  });

  test("revoking an API key is audited and keeps company scoping", async () => {
    const settings = buildSettings({
      apiKeys: [{
        id: "key-1",
        label: "Audit key",
        keyHash: "hash",
        maskedKey: "cf_••••••••1234",
        last4: "1234",
        scopes: ["audit:read"],
        status: "active",
        createdAt: "2026-05-22T00:00:00.000Z",
      }],
    });
    const user = { id: "admin-1", email: "admin@example.com", role: "ADMIN", companyId: "company-1", name: "Admin" };
    jest.spyOn(User, "findByPk").mockResolvedValue(user);
    jest.spyOn(UserContextService, "ensureCompanyContext").mockResolvedValue(user);
    jest.spyOn(Setting, "findOne").mockResolvedValue(settings);
    jest.spyOn(Company, "findByPk").mockResolvedValue({ id: "company-1" });
    jest.spyOn(AuditService, "log").mockResolvedValue({});

    await SettingsService.revokeApiKey(user, "key-1");

    expect(settings.update).toHaveBeenCalledWith(expect.objectContaining({
      apiKeys: [expect.objectContaining({ id: "key-1", status: "revoked" })],
    }));
    expect(AuditService.log).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-1",
      action: "api_key_revoked",
      entityId: "key-1",
    }));
  });
});
