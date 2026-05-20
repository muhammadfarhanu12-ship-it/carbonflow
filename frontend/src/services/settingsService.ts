import { apiClient } from "./apiClient";
import type { SettingsPayload, UserSettings } from "@/src/types/platform";
import { asArray, asNumber, isRecord } from "@/src/utils/apiResponse";

const EMPTY_ORGANIZATION = {
  companyName: "",
  industry: "",
  headquarters: "",
  region: "GLOBAL",
  currency: "USD",
  carbonPricePerTon: 0,
  netZeroTargetYear: new Date().getFullYear(),
  revenueUsd: 0,
  annualShipmentWeightKg: 0,
};

const EMPTY_OPERATIONAL_METRICS = {
  revenueUsd: 0,
  annualShipmentWeightKg: 0,
  electricityConsumptionKwh: 0,
  renewableElectricityPct: 0,
  stationaryFuelLiters: 0,
  mobileFuelLiters: 0,
  companyVehicleKm: 0,
  stationaryFuelType: "DIESEL",
  mobileFuelType: "DIESEL",
};

function normalizeNumberRecord(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, recordValue]) => [key, asNumber(recordValue)]),
  );
}

function normalizeSettings(payload: unknown): UserSettings {
  const source = isRecord(payload) ? payload : {};
  const profile = isRecord(source.profile) ? source.profile : {};
  const organization = isRecord(source.organization) ? source.organization : isRecord(source.company) ? source.company : {};
  const operationalMetrics = isRecord(source.operationalMetrics) ? source.operationalMetrics : {};
  const emissionFactors = isRecord(source.emissionFactors) ? source.emissionFactors : {};
  const preferences = isRecord(source.preferences) ? source.preferences : {};

  return {
    id: String(source.id || ""),
    companyId: String(source.companyId || ""),
    profile: {
      name: String(profile.name || ""),
      email: String(profile.email || ""),
    },
    company: {
      ...EMPTY_ORGANIZATION,
      ...organization,
    },
    organization: {
      ...EMPTY_ORGANIZATION,
      ...organization,
    },
    operationalMetrics: {
      ...EMPTY_OPERATIONAL_METRICS,
      ...operationalMetrics,
      revenueUsd: asNumber(operationalMetrics.revenueUsd),
      annualShipmentWeightKg: asNumber(operationalMetrics.annualShipmentWeightKg),
      electricityConsumptionKwh: asNumber(operationalMetrics.electricityConsumptionKwh),
      renewableElectricityPct: asNumber(operationalMetrics.renewableElectricityPct),
      stationaryFuelLiters: asNumber(operationalMetrics.stationaryFuelLiters),
      mobileFuelLiters: asNumber(operationalMetrics.mobileFuelLiters),
      companyVehicleKm: asNumber(operationalMetrics.companyVehicleKm),
    },
    emissionFactors: {
      transport: normalizeNumberRecord(emissionFactors.transport),
      electricity: normalizeNumberRecord(emissionFactors.electricity),
      fuels: normalizeNumberRecord(emissionFactors.fuels),
      fleet: normalizeNumberRecord(emissionFactors.fleet),
    },
    preferences: {
      notificationsEnabled: preferences.notificationsEnabled !== false,
      securityAlertsEnabled: preferences.securityAlertsEnabled !== false,
    },
    integrations: asArray(source.integrations),
    apiKeys: asArray(source.apiKeys),
  };
}

export const settingsService = {
  getSettings: async () => normalizeSettings(await apiClient.get<unknown>("/user/settings")),
  updateSettings: async (data: SettingsPayload) => normalizeSettings(await apiClient.put<unknown>("/user/settings", data)),
  createApiKey: async (label?: string) => normalizeSettings(await apiClient.post<unknown>("/user/settings/api-keys", { label })),
  syncIntegration: async (name: string) => normalizeSettings(await apiClient.post<unknown>(`/user/settings/integrations/${encodeURIComponent(name)}/sync`)),
};
