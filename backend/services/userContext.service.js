const crypto = require("crypto");
const { Company, Setting } = require("../models");
const env = require("../config/env");
const EmissionRecordService = require("./emissionRecord.service");

function buildDefaultCompanyName(user, overrideName) {
  if (overrideName && String(overrideName).trim()) {
    return String(overrideName).trim();
  }

  const name = String(user.name || "CarbonFlow").trim();
  return name.includes(" ") ? `${name.split(" ")[0]}'s Company` : `${name} Company`;
}

class UserContextService {
  static async provisionCompanyForUser(user, overrides = {}) {
    const company = await Company.create({
      name: buildDefaultCompanyName(user, overrides.companyName),
      industry: overrides.industry || "General",
      headquarters: overrides.headquarters || "Remote",
      region: overrides.region || "GLOBAL",
      currency: overrides.currency || "USD",
      revenueUsd: Number(overrides.revenueUsd || 1000000),
      annualShipmentWeightKg: Number(overrides.annualShipmentWeightKg || 0),
      primaryElectricityRegion: overrides.primaryElectricityRegion || overrides.region || "GLOBAL",
      carbonTargetYear: Number(overrides.netZeroTargetYear || 2040),
      carbonPricePerTon: Number(overrides.carbonPricePerTon || env.carbonPricePerTon),
      apiKey: `cf_${crypto.randomBytes(12).toString("hex")}`,
      status: "TRIAL",
    });

    const settings = await Setting.create({
      companyId: company.id,
      companyName: company.name,
      industry: company.industry,
      region: company.region,
      currency: company.currency,
      carbonPricePerTon: Number(company.carbonPricePerTon),
      netZeroTargetYear: company.carbonTargetYear,
      operationalMetrics: {
        revenueUsd: Number(company.revenueUsd || 1000000),
        annualShipmentWeightKg: Number(company.annualShipmentWeightKg || 0),
        electricityConsumptionKwh: Number(overrides.electricityConsumptionKwh || 0),
        renewableElectricityPct: Number(overrides.renewableElectricityPct || 0),
        stationaryFuelLiters: Number(overrides.stationaryFuelLiters || 0),
        mobileFuelLiters: Number(overrides.mobileFuelLiters || 0),
        companyVehicleKm: Number(overrides.companyVehicleKm || 0),
        stationaryFuelType: overrides.stationaryFuelType || "DIESEL",
        mobileFuelType: overrides.mobileFuelType || "DIESEL",
      },
      emissionFactorOverrides: {
        transport: {},
        electricity: {},
        fuels: {},
        fleet: {},
      },
      notificationsEnabled: true,
      securityAlertsEnabled: true,
      integrations: [
        { name: "ERP Feed", status: "CONNECTED", lastSync: new Date().toISOString() },
        { name: "Carrier API", status: "PENDING", lastSync: null },
      ],
      apiKeys: [{ label: "Primary API Key", key: company.apiKey, createdAt: new Date().toISOString() }],
    });

    user.companyId = company.id;
    await user.save();
    await EmissionRecordService.syncOperationalRecords(company.id, settings);
    return user.reload();
  }

  static async ensureCompanyContext(user) {
    if (!user.companyId) {
      return this.provisionCompanyForUser(user);
    }

    const existingSettings = await Setting.findOne({ companyId: user.companyId });
    if (!existingSettings) {
      const company = await Company.findByPk(user.companyId);
      if (company) {
        const settings = await Setting.create({
          companyId: company.id,
          companyName: company.name,
          industry: company.industry,
          region: company.region || "GLOBAL",
          currency: company.currency || "USD",
          carbonPricePerTon: Number(company.carbonPricePerTon),
          netZeroTargetYear: company.carbonTargetYear,
          operationalMetrics: {
            revenueUsd: Number(company.revenueUsd || 1000000),
            annualShipmentWeightKg: Number(company.annualShipmentWeightKg || 0),
            electricityConsumptionKwh: 0,
            renewableElectricityPct: 0,
            stationaryFuelLiters: 0,
            mobileFuelLiters: 0,
            companyVehicleKm: 0,
            stationaryFuelType: "DIESEL",
            mobileFuelType: "DIESEL",
          },
          emissionFactorOverrides: {
            transport: {},
            electricity: {},
            fuels: {},
            fleet: {},
          },
          notificationsEnabled: true,
          securityAlertsEnabled: true,
          integrations: [],
          apiKeys: company.apiKey ? [{ label: "Primary API Key", key: company.apiKey, createdAt: new Date().toISOString() }] : [],
        });
        await EmissionRecordService.syncOperationalRecords(company.id, settings);
      }
    }

    return user;
  }
}

module.exports = UserContextService;
