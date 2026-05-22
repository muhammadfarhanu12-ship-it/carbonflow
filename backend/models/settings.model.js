const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const settingsSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", required: true, unique: true },
  companyName: { type: String, required: true, trim: true },
  legalName: { type: String, default: null, trim: true },
  industry: { type: String, required: true, trim: true },
  headquarters: { type: String, default: "Remote", trim: true },
  region: { type: String, default: "GLOBAL", trim: true },
  country: { type: String, default: null, trim: true },
  currency: { type: String, default: "USD", trim: true },
  fiscalYearStartMonth: { type: Number, default: 1, min: 1, max: 12 },
  reportingYear: { type: Number, default: () => new Date().getUTCFullYear() },
  carbonPricePerTon: { type: Number, default: 55 },
  netZeroTargetYear: { type: Number, default: 2040 },
  preferredUnits: { type: String, enum: ["metric", "imperial"], default: "metric" },
  defaultReportingBoundary: {
    type: String,
    enum: ["operational_control", "financial_control", "equity_share"],
    default: "operational_control",
  },
  defaultReportInclusionPolicy: {
    type: String,
    enum: ["approved_only", "all_with_warning"],
    default: "approved_only",
  },
  dataRetentionYears: { type: Number, default: 7, min: 1, max: 25 },
  operationalMetrics: {
    type: Object,
    default: {
      revenueUsd: 1000000,
      annualShipmentWeightKg: 0,
      electricityConsumptionKwh: 0,
      renewableElectricityPct: 0,
      stationaryFuelLiters: 0,
      mobileFuelLiters: 0,
      companyVehicleKm: 0,
      stationaryFuelType: "DIESEL",
      mobileFuelType: "DIESEL",
    },
  },
  emissionFactorOverrides: {
    type: Object,
    default: {
      transport: {},
      electricity: {},
      fuels: {},
      fleet: {},
    },
  },
  emissionFactorOverrideMetadata: { type: Object, default: {} },
  notificationsEnabled: { type: Boolean, default: true },
  securityAlertsEnabled: { type: Boolean, default: true },
  reportNotificationsEnabled: { type: Boolean, default: true },
  integrationSyncNotificationsEnabled: { type: Boolean, default: true },
  marketplaceNotificationsEnabled: { type: Boolean, default: true },
  integrations: { type: [Object], default: [] },
  apiKeys: { type: [Object], default: [] },
  updatedBy: { type: String, ref: "User", default: null },
}, {
  collection: "settings",
});

settingsSchema.virtual("organizationId").get(function getOrganizationId() {
  return this.companyId;
});

module.exports = mongoose.models.Setting || mongoose.model("Setting", settingsSchema);
