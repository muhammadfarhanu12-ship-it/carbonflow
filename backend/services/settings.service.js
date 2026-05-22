const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Setting, Company, User } = require("../models");
const UserContextService = require("./userContext.service");
const EmissionRecordService = require("./emissionRecord.service");
const cache = require("../utils/cache");
const AuditService = require("./audit.service");
const ApiError = require("../utils/ApiError");
const { hasPermission } = require("../middlewares/rbac");

const API_KEY_SCOPES = new Set([
  "emissions:read",
  "emissions:write",
  "suppliers:read",
  "suppliers:write",
  "shipments:read",
  "reports:read",
  "reports:generate",
  "marketplace:read",
  "audit:read",
  "admin",
]);

const SUPPORTED_INTEGRATIONS = [
  { name: "ERP Feed", providerType: "erp", providerName: "ERP Feed" },
  { name: "Carrier API", providerType: "carrier", providerName: "Carrier API" },
  { name: "Email/SMTP", providerType: "email", providerName: "Email/SMTP" },
  { name: "Registry Provider", providerType: "registry", providerName: "Registry Provider" },
  { name: "Payment Provider", providerType: "payment", providerName: "Payment Provider" },
  { name: "Storage Provider", providerType: "storage", providerName: "Storage Provider" },
];

function defaultOperationalMetrics(metrics = {}) {
  return {
    revenueUsd: Number(metrics.revenueUsd ?? 1000000),
    annualShipmentWeightKg: Number(metrics.annualShipmentWeightKg ?? 0),
    electricityConsumptionKwh: Number(metrics.electricityConsumptionKwh ?? 0),
    renewableElectricityPct: Number(metrics.renewableElectricityPct ?? 0),
    stationaryFuelLiters: Number(metrics.stationaryFuelLiters ?? 0),
    mobileFuelLiters: Number(metrics.mobileFuelLiters ?? 0),
    companyVehicleKm: Number(metrics.companyVehicleKm ?? 0),
    stationaryFuelType: metrics.stationaryFuelType || "DIESEL",
    mobileFuelType: metrics.mobileFuelType || "DIESEL",
    defaultReportingPeriod: metrics.defaultReportingPeriod || "",
    notes: metrics.notes || "",
    source: metrics.source || "",
  };
}

function normalizePartialOperationalMetrics(metrics = {}) {
  const next = {};

  if (metrics.revenueUsd !== undefined) next.revenueUsd = Number(metrics.revenueUsd);
  if (metrics.annualShipmentWeightKg !== undefined) next.annualShipmentWeightKg = Number(metrics.annualShipmentWeightKg);
  if (metrics.electricityConsumptionKwh !== undefined) next.electricityConsumptionKwh = Number(metrics.electricityConsumptionKwh);
  if (metrics.renewableElectricityPct !== undefined) next.renewableElectricityPct = Number(metrics.renewableElectricityPct);
  if (metrics.stationaryFuelLiters !== undefined) next.stationaryFuelLiters = Number(metrics.stationaryFuelLiters);
  if (metrics.mobileFuelLiters !== undefined) next.mobileFuelLiters = Number(metrics.mobileFuelLiters);
  if (metrics.companyVehicleKm !== undefined) next.companyVehicleKm = Number(metrics.companyVehicleKm);
  if (metrics.stationaryFuelType !== undefined) next.stationaryFuelType = metrics.stationaryFuelType || "DIESEL";
  if (metrics.mobileFuelType !== undefined) next.mobileFuelType = metrics.mobileFuelType || "DIESEL";
  if (metrics.defaultReportingPeriod !== undefined) next.defaultReportingPeriod = String(metrics.defaultReportingPeriod || "");
  if (metrics.notes !== undefined) next.notes = String(metrics.notes || "");
  if (metrics.source !== undefined) next.source = String(metrics.source || "");

  return next;
}

function defaultEmissionFactorOverrides(overrides = {}) {
  return {
    transport: overrides.transport || {},
    electricity: overrides.electricity || {},
    fuels: overrides.fuels || {},
    fleet: overrides.fleet || {},
  };
}

function normalizePartialEmissionFactorOverrides(overrides = {}) {
  const next = {};

  if (overrides.transport) next.transport = overrides.transport;
  if (overrides.electricity) next.electricity = overrides.electricity;
  if (overrides.fuels) next.fuels = overrides.fuels;
  if (overrides.fleet) next.fleet = overrides.fleet;

  return next;
}

function normalizeCurrency(value) {
  const normalized = String(value || "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new ApiError(422, "Currency must be a valid 3-letter ISO code.");
  }
  return normalized;
}

function ensurePermission(user, permission) {
  if (!hasPermission(user, permission)) {
    throw new ApiError(403, `Permission denied: ${permission}`);
  }
}

function ensurePasswordPolicy(password, confirmPassword) {
  if (!password) return;
  if (confirmPassword !== undefined && password !== confirmPassword) {
    throw new ApiError(422, "Password confirmation does not match.");
  }
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}/.test(String(password))) {
    throw new ApiError(422, "New password must be at least 10 characters and include uppercase, lowercase, number, and symbol characters.");
  }
}

function normalizeOrganizationPayload(payload = {}) {
  const currentYear = new Date().getUTCFullYear();
  const next = {};

  if (payload.companyName !== undefined) {
    const companyName = String(payload.companyName || "").trim();
    if (companyName.length < 2) throw new ApiError(422, "Organization name is required.");
    next.companyName = companyName;
  }
  if (payload.legalName !== undefined) next.legalName = String(payload.legalName || "").trim() || null;
  if (payload.industry !== undefined) next.industry = String(payload.industry || "").trim();
  if (payload.headquarters !== undefined) next.headquarters = String(payload.headquarters || "").trim();
  if (payload.region !== undefined) next.region = String(payload.region || "GLOBAL").trim();
  if (payload.country !== undefined) next.country = String(payload.country || "").trim() || null;
  if (payload.currency !== undefined) next.currency = normalizeCurrency(payload.currency);
  if (payload.fiscalYearStartMonth !== undefined) next.fiscalYearStartMonth = Number(payload.fiscalYearStartMonth);
  if (payload.reportingYear !== undefined) next.reportingYear = Number(payload.reportingYear);
  if (payload.carbonPricePerTon !== undefined) next.carbonPricePerTon = Number(payload.carbonPricePerTon);
  if (payload.netZeroTargetYear !== undefined) next.netZeroTargetYear = Number(payload.netZeroTargetYear);
  if (payload.revenueUsd !== undefined) next.revenueUsd = Number(payload.revenueUsd);
  if (payload.annualShipmentWeightKg !== undefined) next.annualShipmentWeightKg = Number(payload.annualShipmentWeightKg);
  if (payload.preferredUnits !== undefined) next.preferredUnits = payload.preferredUnits;
  if (payload.defaultReportingBoundary !== undefined) next.defaultReportingBoundary = payload.defaultReportingBoundary;
  if (payload.defaultReportInclusionPolicy !== undefined) next.defaultReportInclusionPolicy = payload.defaultReportInclusionPolicy;
  if (payload.dataRetentionYears !== undefined) next.dataRetentionYears = Number(payload.dataRetentionYears);

  if (next.netZeroTargetYear !== undefined && (next.netZeroTargetYear < currentYear || next.netZeroTargetYear > 2100)) {
    throw new ApiError(422, "Net zero target year must be between the current year and 2100.");
  }
  ["carbonPricePerTon", "revenueUsd", "annualShipmentWeightKg"].forEach((field) => {
    if (next[field] !== undefined && (!Number.isFinite(next[field]) || next[field] < 0)) {
      throw new ApiError(422, `${field} must be greater than or equal to 0.`);
    }
  });
  if (next.fiscalYearStartMonth !== undefined && (next.fiscalYearStartMonth < 1 || next.fiscalYearStartMonth > 12)) {
    throw new ApiError(422, "Fiscal year start month must be between 1 and 12.");
  }
  if (next.reportingYear !== undefined && (next.reportingYear < 2000 || next.reportingYear > 2200)) {
    throw new ApiError(422, "Reporting year is outside the supported range.");
  }
  if (next.dataRetentionYears !== undefined && (next.dataRetentionYears < 1 || next.dataRetentionYears > 25)) {
    throw new ApiError(422, "Data retention years must be between 1 and 25.");
  }

  return next;
}

function validateOperationalMetrics(metrics = {}) {
  const next = normalizePartialOperationalMetrics(metrics);
  ["revenueUsd", "annualShipmentWeightKg", "electricityConsumptionKwh", "stationaryFuelLiters", "mobileFuelLiters", "companyVehicleKm"].forEach((field) => {
    if (next[field] !== undefined && (!Number.isFinite(next[field]) || next[field] < 0)) {
      throw new ApiError(422, `${field} must be greater than or equal to 0.`);
    }
  });
  if (next.renewableElectricityPct !== undefined && (next.renewableElectricityPct < 0 || next.renewableElectricityPct > 100)) {
    throw new ApiError(422, "Renewable electricity percent must be between 0 and 100.");
  }
  return next;
}

function validateEmissionFactorOverrides(overrides = {}, metadata = {}) {
  const next = normalizePartialEmissionFactorOverrides(overrides);
  const changed = [];
  ["transport", "electricity", "fuels", "fleet"].forEach((group) => {
    if (!next[group]) return;
    Object.entries(next[group]).forEach(([key, value]) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) {
        throw new ApiError(422, `Emission factor override ${group}.${key} must be greater than or equal to 0.`);
      }
      if (numeric > 0) changed.push(`${group}.${key}`);
      next[group][key] = numeric;
    });
  });

  if (changed.length > 0) {
    const required = ["sourceName", "sourceYear", "unit", "region", "reason"];
    required.forEach((field) => {
      if (!metadata[field]) {
        throw new ApiError(422, "Factor overrides require source name, source year, unit, region, and reason.");
      }
    });
  }

  return next;
}

function hashApiKey(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function generateApiKey() {
  return `cf_${crypto.randomBytes(32).toString("base64url")}`;
}

function maskApiKey(value = "", last4 = "") {
  const suffix = last4 || String(value).slice(-4);
  return `cf_${"\u2022".repeat(8)}${suffix}`;
}

function normalizeApiKeyRecord(record = {}) {
  const fullKey = record.key || record.plaintextKey || "";
  const last4 = record.last4 || String(fullKey).slice(-4);
  return {
    id: record.id || record.keyId || crypto.randomUUID(),
    label: record.label || "API Key",
    maskedKey: record.maskedKey || maskApiKey(fullKey, last4),
    key: record.maskedKey || maskApiKey(fullKey, last4),
    prefix: record.prefix || "cf_",
    last4,
    scopes: Array.isArray(record.scopes) ? record.scopes : ["emissions:read"],
    status: record.status || "active",
    expiresAt: record.expiresAt || null,
    lastUsedAt: record.lastUsedAt || null,
    createdBy: record.createdBy || null,
    createdAt: record.createdAt || new Date().toISOString(),
    revokedAt: record.revokedAt || null,
  };
}

function storedApiKeyRecord(record = {}) {
  if (record.keyHash) {
    return {
      ...record,
      key: undefined,
      plaintextKey: undefined,
      maskedKey: record.maskedKey || maskApiKey("", record.last4),
    };
  }

  const fullKey = record.key || record.plaintextKey || generateApiKey();
  const last4 = String(fullKey).slice(-4);
  return {
    id: record.id || crypto.randomUUID(),
    label: record.label || "API Key",
    keyHash: hashApiKey(fullKey),
    maskedKey: maskApiKey(fullKey, last4),
    prefix: "cf_",
    last4,
    scopes: Array.isArray(record.scopes) ? record.scopes : ["emissions:read"],
    status: record.status || "active",
    expiresAt: record.expiresAt || null,
    lastUsedAt: record.lastUsedAt || null,
    createdBy: record.createdBy || null,
    createdAt: record.createdAt || new Date().toISOString(),
    revokedAt: record.revokedAt || null,
  };
}

function normalizeScopes(scopes = []) {
  const normalized = Array.isArray(scopes) && scopes.length ? scopes : ["emissions:read"];
  normalized.forEach((scope) => {
    if (!API_KEY_SCOPES.has(scope)) {
      throw new ApiError(422, `Unsupported API key scope: ${scope}`);
    }
  });
  return [...new Set(normalized)];
}

function safeIntegrationRecord(record = {}, defaults = {}) {
  const nowStatus = record.status || "not_configured";
  return {
    id: record.id || defaults.name || crypto.randomUUID(),
    name: record.name || defaults.name,
    providerType: record.providerType || defaults.providerType || "custom",
    providerName: record.providerName || record.name || defaults.providerName || defaults.name,
    status: String(nowStatus).toLowerCase(),
    syncStatus: record.syncStatus || "idle",
    lastSync: record.lastSync || record.lastSyncAt || null,
    lastSyncAt: record.lastSyncAt || record.lastSync || null,
    lastSuccessfulSyncAt: record.lastSuccessfulSyncAt || null,
    lastFailedSyncAt: record.lastFailedSyncAt || null,
    lastError: record.lastError || null,
    configMetadata: record.configMetadata || {},
    syncHistory: Array.isArray(record.syncHistory) ? record.syncHistory.slice(0, 25) : [],
    createdBy: record.createdBy || null,
    updatedBy: record.updatedBy || null,
    updatedAt: record.updatedAt || null,
  };
}

function normalizeIntegrations(integrations = []) {
  const byName = new Map((integrations || []).map((item) => [item.name, item]));
  return SUPPORTED_INTEGRATIONS.map((defaults) => safeIntegrationRecord(byName.get(defaults.name), defaults));
}

function safeSettingsResponse(settings, hydratedUser, company, extras = {}) {
  const organization = {
    companyName: settings.companyName,
    legalName: settings.legalName || null,
    industry: settings.industry,
    headquarters: settings.headquarters || company?.headquarters || "Remote",
    region: settings.region || company?.region || "GLOBAL",
    country: settings.country || null,
    currency: settings.currency || company?.currency || "USD",
    fiscalYearStartMonth: Number(settings.fiscalYearStartMonth || 1),
    reportingYear: Number(settings.reportingYear || new Date().getUTCFullYear()),
    carbonPricePerTon: Number(settings.carbonPricePerTon),
    netZeroTargetYear: Number(settings.netZeroTargetYear),
    revenueUsd: Number(settings.operationalMetrics?.revenueUsd || company?.revenueUsd || 0),
    annualShipmentWeightKg: Number(settings.operationalMetrics?.annualShipmentWeightKg || company?.annualShipmentWeightKg || 0),
    preferredUnits: settings.preferredUnits || "metric",
    defaultReportingBoundary: settings.defaultReportingBoundary || "operational_control",
    defaultReportInclusionPolicy: settings.defaultReportInclusionPolicy || "approved_only",
    dataRetentionYears: Number(settings.dataRetentionYears || 7),
    updatedAt: settings.updatedAt || null,
    updatedBy: settings.updatedBy || null,
  };

  return {
    id: settings.id,
    companyId: hydratedUser.companyId,
    profile: {
      name: hydratedUser.name,
      email: hydratedUser.email,
      emailVerified: Boolean(hydratedUser.isVerified),
      role: hydratedUser.role,
      companyName: organization.companyName,
      timezone: hydratedUser.timezone || null,
      locale: hydratedUser.locale || null,
      lastLoginAt: hydratedUser.lastLoginAt || null,
      createdAt: hydratedUser.createdAt || null,
    },
    company: organization,
    organization,
    operationalMetrics: defaultOperationalMetrics(settings.operationalMetrics),
    emissionFactors: defaultEmissionFactorOverrides(settings.emissionFactorOverrides),
    emissionFactorMetadata: settings.emissionFactorOverrideMetadata || {},
    preferences: {
      notificationsEnabled: settings.notificationsEnabled,
      securityAlertsEnabled: settings.securityAlertsEnabled,
      reportNotificationsEnabled: settings.reportNotificationsEnabled !== false,
      integrationSyncNotificationsEnabled: settings.integrationSyncNotificationsEnabled !== false,
      marketplaceNotificationsEnabled: settings.marketplaceNotificationsEnabled !== false,
    },
    security: {
      mfaStatus: "not_configured",
      activeSessionsSupported: false,
      ssoStatus: "not_configured",
      passwordPolicy: "Minimum 10 characters with uppercase, lowercase, number, and symbol.",
    },
    integrations: normalizeIntegrations(settings.integrations || []),
    apiKeys: (settings.apiKeys || []).map(normalizeApiKeyRecord),
    ...extras,
  };
}

class SettingsService {
  static async getByCompanyId(companyId) {
    const settings = await Setting.findOne({ companyId });
    if (!settings) {
      const error = new Error("Settings not found");
      error.status = 404;
      throw error;
    }

    return settings;
  }

  static async get(user) {
    const hydratedUser = await UserContextService.ensureCompanyContext(user);
    const [settings, company] = await Promise.all([
      this.getByCompanyId(hydratedUser.companyId),
      Company.findByPk(hydratedUser.companyId),
    ]);

    if ((settings.apiKeys || []).some((record) => record.key || record.plaintextKey || !record.keyHash) || company?.apiKey) {
      await settings.update({ apiKeys: (settings.apiKeys || []).map(storedApiKeyRecord) });
      if (company?.apiKey) {
        await company.update({ apiKey: null });
      }
    }

    return safeSettingsResponse(settings, hydratedUser, company);
  }

  static async update(user, payload) {
    const hydratedUser = await User.findByPk(user.id);
    await UserContextService.ensureCompanyContext(hydratedUser);
    const settings = await this.getByCompanyId(hydratedUser.companyId);
    const company = await Company.findByPk(hydratedUser.companyId);
    const organizationPayload = normalizeOrganizationPayload(payload.organization || payload.company || {});
    const oldValue = safeSettingsResponse(settings, hydratedUser, company);

    if (payload.profile) {
      ensurePermission(user, "settings:profile:update");
      if (payload.profile.email && payload.profile.email !== hydratedUser.email) {
        throw new ApiError(422, "Email changes require the dedicated verification workflow.");
      }

      await hydratedUser.update({
        name: payload.profile.name || hydratedUser.name,
      });
      await AuditService.log({
        companyId: hydratedUser.companyId,
        userId: hydratedUser.id,
        userEmail: hydratedUser.email,
        action: "profile_updated",
        entityType: "User",
        entityId: hydratedUser.id,
        oldValue: { name: oldValue.profile.name },
        newValue: { name: payload.profile.name || hydratedUser.name },
      });
    }

    if (payload.password?.newPassword) {
      ensurePermission(user, "settings:security:update");
      ensurePasswordPolicy(payload.password.newPassword, payload.password.confirmPassword);
      const scopedUser = await User.scope("withPassword").findByPk(hydratedUser.id);
      const isValid = await bcrypt.compare(payload.password.currentPassword || "", scopedUser.password);
      if (!isValid) {
        throw new ApiError(422, "Current password is incorrect");
      }

      scopedUser.password = await bcrypt.hash(payload.password.newPassword, 12);
      await scopedUser.save();
      await AuditService.log({
        companyId: hydratedUser.companyId,
        userId: hydratedUser.id,
        userEmail: hydratedUser.email,
        action: "password_changed",
        entityType: "User",
        entityId: hydratedUser.id,
        severity: "critical",
        category: "security",
      });
    }

    if (payload.company || payload.organization || payload.preferences || payload.operationalMetrics || payload.emissionFactors) {
      if (payload.company || payload.organization) ensurePermission(user, "settings:organization:update");
      if (payload.operationalMetrics || payload.emissionFactors) ensurePermission(user, "settings:emissions:update");
      if (payload.preferences) ensurePermission(user, "settings:security:update");
      const operationalMetrics = validateOperationalMetrics(payload.operationalMetrics || {});
      const emissionFactorOverrides = validateEmissionFactorOverrides(payload.emissionFactors || {}, payload.emissionFactorMetadata || {});
      await settings.update({
        companyName: organizationPayload.companyName || settings.companyName,
        legalName: organizationPayload.legalName ?? settings.legalName,
        industry: organizationPayload.industry || settings.industry,
        headquarters: organizationPayload.headquarters || settings.headquarters || company?.headquarters || "Remote",
        region: organizationPayload.region || settings.region || "GLOBAL",
        country: organizationPayload.country ?? settings.country,
        currency: organizationPayload.currency || settings.currency || "USD",
        fiscalYearStartMonth: organizationPayload.fiscalYearStartMonth ?? settings.fiscalYearStartMonth ?? 1,
        reportingYear: organizationPayload.reportingYear ?? settings.reportingYear ?? new Date().getUTCFullYear(),
        carbonPricePerTon: organizationPayload.carbonPricePerTon ?? settings.carbonPricePerTon,
        netZeroTargetYear: organizationPayload.netZeroTargetYear ?? settings.netZeroTargetYear,
        preferredUnits: organizationPayload.preferredUnits || settings.preferredUnits || "metric",
        defaultReportingBoundary: organizationPayload.defaultReportingBoundary || settings.defaultReportingBoundary || "operational_control",
        defaultReportInclusionPolicy: organizationPayload.defaultReportInclusionPolicy || settings.defaultReportInclusionPolicy || "approved_only",
        dataRetentionYears: organizationPayload.dataRetentionYears ?? settings.dataRetentionYears ?? 7,
        operationalMetrics: {
          ...defaultOperationalMetrics(settings.operationalMetrics),
          ...operationalMetrics,
          revenueUsd: Number(payload.operationalMetrics?.revenueUsd ?? organizationPayload.revenueUsd ?? settings.operationalMetrics?.revenueUsd ?? 0),
          annualShipmentWeightKg: Number(payload.operationalMetrics?.annualShipmentWeightKg ?? organizationPayload.annualShipmentWeightKg ?? settings.operationalMetrics?.annualShipmentWeightKg ?? 0),
        },
        emissionFactorOverrides: {
          ...defaultEmissionFactorOverrides(settings.emissionFactorOverrides),
          ...emissionFactorOverrides,
        },
        emissionFactorOverrideMetadata: payload.emissionFactorMetadata ? {
          ...(settings.emissionFactorOverrideMetadata || {}),
          ...payload.emissionFactorMetadata,
          approvalStatus: payload.emissionFactorMetadata.approvalStatus || "documented",
          updatedBy: hydratedUser.id,
          updatedAt: new Date().toISOString(),
        } : settings.emissionFactorOverrideMetadata,
        notificationsEnabled: payload.preferences?.notificationsEnabled ?? settings.notificationsEnabled,
        securityAlertsEnabled: payload.preferences?.securityAlertsEnabled ?? settings.securityAlertsEnabled,
        reportNotificationsEnabled: payload.preferences?.reportNotificationsEnabled ?? settings.reportNotificationsEnabled,
        integrationSyncNotificationsEnabled: payload.preferences?.integrationSyncNotificationsEnabled ?? settings.integrationSyncNotificationsEnabled,
        marketplaceNotificationsEnabled: payload.preferences?.marketplaceNotificationsEnabled ?? settings.marketplaceNotificationsEnabled,
        updatedBy: hydratedUser.id,
      });
    }

    if (company && (payload.company || payload.organization || payload.operationalMetrics)) {
      await company.update({
        name: organizationPayload.companyName || company.name,
        industry: organizationPayload.industry || company.industry,
        headquarters: organizationPayload.headquarters || company.headquarters,
        region: organizationPayload.region || company.region || "GLOBAL",
        currency: organizationPayload.currency || company.currency || "USD",
        revenueUsd: Number(payload.operationalMetrics?.revenueUsd ?? organizationPayload.revenueUsd ?? company.revenueUsd ?? 0),
        annualShipmentWeightKg: Number(payload.operationalMetrics?.annualShipmentWeightKg ?? organizationPayload.annualShipmentWeightKg ?? company.annualShipmentWeightKg ?? 0),
        primaryElectricityRegion: organizationPayload.region || company.primaryElectricityRegion || company.region || "GLOBAL",
        carbonTargetYear: organizationPayload.netZeroTargetYear ?? company.carbonTargetYear,
        carbonPricePerTon: organizationPayload.carbonPricePerTon ?? company.carbonPricePerTon,
      });
    }

    const updatedSettings = await this.getByCompanyId(hydratedUser.companyId);
    await EmissionRecordService.syncOperationalRecords(hydratedUser.companyId, updatedSettings);
    cache.removeByPrefix(`dashboard:${hydratedUser.companyId}:`);
    const sections = Object.keys(payload || {});
    const action = sections.includes("emissionFactors")
      ? "factor_override_updated"
      : sections.includes("operationalMetrics")
        ? "emissions_settings_updated"
        : sections.includes("preferences")
          ? "notification_preferences_updated"
          : sections.includes("organization") || sections.includes("company")
            ? "organization_settings_updated"
            : "settings_updated";
    await AuditService.log({
      companyId: hydratedUser.companyId,
      userId: hydratedUser.id,
      userEmail: hydratedUser.email,
      action,
      entityType: "Setting",
      entityId: settings.id,
      oldValue,
      newValue: safeSettingsResponse(updatedSettings, hydratedUser, company),
      details: { updatedSections: sections },
    });
    return this.get(hydratedUser);
  }

  static async createApiKey(user, payload = {}) {
    ensurePermission(user, "settings:api_keys:manage");
    const hydratedUser = await User.findByPk(user.id);
    await UserContextService.ensureCompanyContext(hydratedUser);
    const settings = await this.getByCompanyId(hydratedUser.companyId);
    const company = await Company.findByPk(hydratedUser.companyId);
    const plaintextKey = generateApiKey();
    const last4 = plaintextKey.slice(-4);
    const label = payload.label || "Generated API Key";
    const keyRecord = {
      id: crypto.randomUUID(),
      label,
      keyHash: hashApiKey(plaintextKey),
      maskedKey: maskApiKey(plaintextKey, last4),
      prefix: "cf_",
      last4,
      scopes: normalizeScopes(payload.scopes),
      status: "active",
      expiresAt: payload.expiresAt || null,
      lastUsedAt: null,
      createdBy: hydratedUser.id,
      createdAt: new Date().toISOString(),
    };
    const apiKeys = [
      keyRecord,
      ...(settings.apiKeys || []).map(storedApiKeyRecord),
    ];

    await settings.update({ apiKeys });
    if (company) {
      await company.update({ apiKey: null });
    }

    cache.removeByPrefix(`dashboard:${hydratedUser.companyId}:`);
    await AuditService.log({
      companyId: hydratedUser.companyId,
      userId: hydratedUser.id,
      userEmail: hydratedUser.email,
      action: "api_key_created",
      entityType: "ApiKey",
      entityId: keyRecord.id,
      metadata: { label, scopes: keyRecord.scopes, expiresAt: keyRecord.expiresAt },
    });
    return safeSettingsResponse(settings, hydratedUser, company, { oneTimeApiKey: plaintextKey, oneTimeApiKeyId: keyRecord.id });
  }

  static async revokeApiKey(user, id) {
    ensurePermission(user, "settings:api_keys:manage");
    const hydratedUser = await User.findByPk(user.id);
    await UserContextService.ensureCompanyContext(hydratedUser);
    const settings = await this.getByCompanyId(hydratedUser.companyId);
    const apiKeys = (settings.apiKeys || []).map(storedApiKeyRecord);
    const index = apiKeys.findIndex((item) => item.id === id);
    if (index === -1) throw new ApiError(404, "API key not found.");
    const oldValue = { ...apiKeys[index] };
    apiKeys[index] = { ...apiKeys[index], status: "revoked", revokedAt: new Date().toISOString() };
    await settings.update({ apiKeys });
    await AuditService.log({
      companyId: hydratedUser.companyId,
      userId: hydratedUser.id,
      userEmail: hydratedUser.email,
      action: "api_key_revoked",
      entityType: "ApiKey",
      entityId: id,
      oldValue,
      newValue: apiKeys[index],
    });
    return this.get(hydratedUser);
  }

  static async rotateApiKey(user, id, payload = {}) {
    ensurePermission(user, "settings:api_keys:manage");
    const hydratedUser = await User.findByPk(user.id);
    await UserContextService.ensureCompanyContext(hydratedUser);
    const settings = await this.getByCompanyId(hydratedUser.companyId);
    const company = await Company.findByPk(hydratedUser.companyId);
    const apiKeys = (settings.apiKeys || []).map(storedApiKeyRecord);
    const index = apiKeys.findIndex((item) => item.id === id);
    if (index === -1) throw new ApiError(404, "API key not found.");
    const plaintextKey = generateApiKey();
    const last4 = plaintextKey.slice(-4);
    const oldValue = { ...apiKeys[index] };
    apiKeys[index] = {
      ...apiKeys[index],
      keyHash: hashApiKey(plaintextKey),
      maskedKey: maskApiKey(plaintextKey, last4),
      last4,
      status: "active",
      expiresAt: payload.expiresAt || apiKeys[index].expiresAt || null,
      rotatedAt: new Date().toISOString(),
      revokedAt: null,
    };
    await settings.update({ apiKeys });
    await AuditService.log({
      companyId: hydratedUser.companyId,
      userId: hydratedUser.id,
      userEmail: hydratedUser.email,
      action: "api_key_rotated",
      entityType: "ApiKey",
      entityId: id,
      oldValue,
      newValue: apiKeys[index],
    });
    return safeSettingsResponse(settings, hydratedUser, company, { oneTimeApiKey: plaintextKey, oneTimeApiKeyId: id });
  }

  static async updateIntegrationStatus(user, integrationName, operation) {
    const hydratedUser = await User.findByPk(user.id);
    await UserContextService.ensureCompanyContext(hydratedUser);
    const settings = await this.getByCompanyId(hydratedUser.companyId);
    const now = new Date().toISOString();
    const normalized = decodeURIComponent(integrationName);
    const currentIntegrations = normalizeIntegrations(settings.integrations || []);
    const match = currentIntegrations.find((item) => item.name === normalized);
    if (!match) throw new ApiError(404, "Integration is not supported.");
    const configured = match.status === "connected" || match.configMetadata?.configured === true;
    const event = {
      at: now,
      operation,
      status: configured ? "success" : "failed",
      message: configured ? `${operation} completed.` : "Integration is not configured. Add credentials or environment references before testing or syncing.",
    };
    const updated = {
      ...match,
      syncStatus: configured ? "completed" : "failed",
      status: configured ? "connected" : "not_configured",
      lastSync: operation === "sync" ? now : match.lastSync,
      lastSyncAt: operation === "sync" ? now : match.lastSyncAt,
      lastSuccessfulSyncAt: configured ? now : match.lastSuccessfulSyncAt,
      lastFailedSyncAt: configured ? match.lastFailedSyncAt : now,
      lastError: configured ? null : event.message,
      syncHistory: [event, ...(match.syncHistory || [])].slice(0, 25),
      updatedBy: hydratedUser.id,
      updatedAt: now,
    };

    const integrations = currentIntegrations.map((item) => (item.name === normalized ? updated : item));
    await settings.update({ integrations });
    cache.removeByPrefix(`dashboard:${hydratedUser.companyId}:`);
    await AuditService.log({
      companyId: hydratedUser.companyId,
      userId: hydratedUser.id,
      userEmail: hydratedUser.email,
      action: configured
        ? (operation === "sync" ? "integration_sync_completed" : "integration_tested")
        : "integration_sync_failed",
      entityType: "Integration",
      entityId: normalized,
      status: configured ? "success" : "failed",
      metadata: { providerType: updated.providerType, operation, lastError: updated.lastError },
    });
    return this.get(hydratedUser);
  }

  static async testIntegration(user, integrationName) {
    ensurePermission(user, "settings:integrations:manage");
    return this.updateIntegrationStatus(user, integrationName, "test");
  }

  static async syncIntegration(user, integrationName) {
    ensurePermission(user, "settings:integrations:manage");
    return this.updateIntegrationStatus(user, integrationName, "sync");
  }

  static async integrationHistory(user, integrationName) {
    const hydratedUser = await User.findByPk(user.id);
    await UserContextService.ensureCompanyContext(hydratedUser);
    const settings = await this.getByCompanyId(hydratedUser.companyId);
    const normalized = decodeURIComponent(integrationName);
    const integration = normalizeIntegrations(settings.integrations || []).find((item) => item.name === normalized);
    if (!integration) throw new ApiError(404, "Integration is not supported.");
    return integration.syncHistory || [];
  }
}

module.exports = SettingsService;
module.exports.hashApiKey = hashApiKey;
module.exports.normalizeApiKeyRecord = normalizeApiKeyRecord;
module.exports.validateEmissionFactorOverrides = validateEmissionFactorOverrides;
