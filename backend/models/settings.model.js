const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const settingsSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", required: true, unique: true },
  companyName: { type: String, required: true, trim: true },
  industry: { type: String, required: true, trim: true },
  region: { type: String, default: "GLOBAL", trim: true },
  currency: { type: String, default: "USD", trim: true },
  carbonPricePerTon: { type: Number, default: 55 },
  netZeroTargetYear: { type: Number, default: 2040 },
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
  notificationsEnabled: { type: Boolean, default: true },
  securityAlertsEnabled: { type: Boolean, default: true },
  integrations: { type: [Object], default: [] },
  apiKeys: { type: [Object], default: [] },
}, {
  collection: "settings",
});

settingsSchema.virtual("organizationId").get(function getOrganizationId() {
  return this.companyId;
});

module.exports = mongoose.models.Setting || mongoose.model("Setting", settingsSchema);
