const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Setting, Company, User } = require("../models");
const UserContextService = require("./userContext.service");
const EmissionRecordService = require("./emissionRecord.service");
const cache = require("../utils/cache");
const AuditService = require("./audit.service");

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

    return {
      id: settings.id,
      companyId: hydratedUser.companyId,
      profile: {
        name: hydratedUser.name,
        email: hydratedUser.email,
      },
      company: {
        companyName: settings.companyName,
        industry: settings.industry,
        headquarters: company?.headquarters || "Remote",
        region: settings.region || company?.region || "GLOBAL",
        currency: settings.currency || company?.currency || "USD",
        carbonPricePerTon: Number(settings.carbonPricePerTon),
        netZeroTargetYear: Number(settings.netZeroTargetYear),
        revenueUsd: Number(settings.operationalMetrics?.revenueUsd || company?.revenueUsd || 0),
        annualShipmentWeightKg: Number(settings.operationalMetrics?.annualShipmentWeightKg || company?.annualShipmentWeightKg || 0),
      },
      organization: {
        companyName: settings.companyName,
        industry: settings.industry,
        headquarters: company?.headquarters || "Remote",
        region: settings.region || company?.region || "GLOBAL",
        currency: settings.currency || company?.currency || "USD",
        carbonPricePerTon: Number(settings.carbonPricePerTon),
        netZeroTargetYear: Number(settings.netZeroTargetYear),
        revenueUsd: Number(settings.operationalMetrics?.revenueUsd || company?.revenueUsd || 0),
        annualShipmentWeightKg: Number(settings.operationalMetrics?.annualShipmentWeightKg || company?.annualShipmentWeightKg || 0),
      },
      operationalMetrics: defaultOperationalMetrics(settings.operationalMetrics),
      emissionFactors: defaultEmissionFactorOverrides(settings.emissionFactorOverrides),
      preferences: {
        notificationsEnabled: settings.notificationsEnabled,
        securityAlertsEnabled: settings.securityAlertsEnabled,
      },
      integrations: settings.integrations || [],
      apiKeys: settings.apiKeys || [],
    };
  }

  static async update(user, payload) {
    const hydratedUser = await User.findByPk(user.id);
    await UserContextService.ensureCompanyContext(hydratedUser);
    const settings = await this.getByCompanyId(hydratedUser.companyId);
    const company = await Company.findByPk(hydratedUser.companyId);
    const organizationPayload = payload.organization || payload.company || {};

    if (payload.profile) {
      const existingUser = await User.findOne({
        email: payload.profile.email,
        _id: { $ne: hydratedUser.id },
      });

      if (existingUser) {
        const error = new Error("That email address is already in use");
        error.status = 409;
        throw error;
      }

      await hydratedUser.update({
        name: payload.profile.name || hydratedUser.name,
        email: payload.profile.email || hydratedUser.email,
      });
    }

    if (payload.password?.newPassword) {
      const scopedUser = await User.scope("withPassword").findByPk(hydratedUser.id);
      const isValid = await bcrypt.compare(payload.password.currentPassword || "", scopedUser.password);
      if (!isValid) {
        const error = new Error("Current password is incorrect");
        error.status = 422;
        throw error;
      }

      scopedUser.password = await bcrypt.hash(payload.password.newPassword, 12);
      await scopedUser.save();
    }

    if (payload.company || payload.organization || payload.preferences || payload.operationalMetrics || payload.emissionFactors) {
      await settings.update({
        companyName: organizationPayload.companyName || settings.companyName,
        industry: organizationPayload.industry || settings.industry,
        region: organizationPayload.region || settings.region || "GLOBAL",
        currency: organizationPayload.currency || settings.currency || "USD",
        carbonPricePerTon: organizationPayload.carbonPricePerTon ?? settings.carbonPricePerTon,
        netZeroTargetYear: organizationPayload.netZeroTargetYear ?? settings.netZeroTargetYear,
        operationalMetrics: {
          ...defaultOperationalMetrics(settings.operationalMetrics),
          ...normalizePartialOperationalMetrics(payload.operationalMetrics),
          revenueUsd: Number(payload.operationalMetrics?.revenueUsd ?? organizationPayload.revenueUsd ?? settings.operationalMetrics?.revenueUsd ?? 0),
          annualShipmentWeightKg: Number(payload.operationalMetrics?.annualShipmentWeightKg ?? organizationPayload.annualShipmentWeightKg ?? settings.operationalMetrics?.annualShipmentWeightKg ?? 0),
        },
        emissionFactorOverrides: {
          ...defaultEmissionFactorOverrides(settings.emissionFactorOverrides),
          ...normalizePartialEmissionFactorOverrides(payload.emissionFactors),
        },
        notificationsEnabled: payload.preferences?.notificationsEnabled ?? settings.notificationsEnabled,
        securityAlertsEnabled: payload.preferences?.securityAlertsEnabled ?? settings.securityAlertsEnabled,
        integrations: payload.integrations || settings.integrations,
        apiKeys: payload.apiKeys || settings.apiKeys,
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
    await AuditService.log({
      companyId: hydratedUser.companyId,
      userId: hydratedUser.id,
      userEmail: hydratedUser.email,
      action: "settings.updated",
      entityType: "Setting",
      entityId: settings.id,
      details: {
        updatedSections: Object.keys(payload || {}),
      },
    });
    return this.get(hydratedUser);
  }

  static async createApiKey(user, label = "Generated API Key") {
    const hydratedUser = await User.findByPk(user.id);
    await UserContextService.ensureCompanyContext(hydratedUser);
    const settings = await this.getByCompanyId(hydratedUser.companyId);
    const company = await Company.findByPk(hydratedUser.companyId);
    const key = `cf_${crypto.randomBytes(16).toString("hex")}`;
    const apiKeys = [
      { label, key, createdAt: new Date().toISOString() },
      ...(settings.apiKeys || []),
    ];

    await settings.update({ apiKeys });
    if (company) {
      await company.update({ apiKey: key });
    }

    cache.removeByPrefix(`dashboard:${hydratedUser.companyId}:`);
    return this.get(hydratedUser);
  }

  static async syncIntegration(user, integrationName) {
    const hydratedUser = await User.findByPk(user.id);
    await UserContextService.ensureCompanyContext(hydratedUser);
    const settings = await this.getByCompanyId(hydratedUser.companyId);
    const now = new Date().toISOString();
    const currentIntegrations = settings.integrations || [];
    const normalized = decodeURIComponent(integrationName);
    const match = currentIntegrations.find((item) => item.name === normalized);

    const integrations = match
      ? currentIntegrations.map((item) => (
        item.name === normalized ? { ...item, status: "CONNECTED", lastSync: now } : item
      ))
      : [...currentIntegrations, { name: normalized, status: "CONNECTED", lastSync: now }];

    await settings.update({ integrations });
    cache.removeByPrefix(`dashboard:${hydratedUser.companyId}:`);
    return this.get(hydratedUser);
  }
}

module.exports = SettingsService;
