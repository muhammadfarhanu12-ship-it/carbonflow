const { TRANSPORT_MODES, SUPPLIER_RISK_LEVELS } = require("../constants/platform");

const DEFAULT_EMISSION_FACTORS = {
  scope1: {
    fuelsKgPerUnit: {
      DIESEL: 2.68,
      PETROL: 2.31,
      GASOLINE: 2.31,
      NATURAL_GAS: 2.03,
      LPG: 1.51,
    },
    fleetKgPerKm: {
      DIESEL: 0.27,
      PETROL: 0.24,
      ELECTRIC: 0.06,
      HYBRID: 0.11,
    },
  },
  scope2: {
    electricityKgPerKwh: {
      GLOBAL: 0.42,
      NORTH_AMERICA: 0.38,
      EUROPE: 0.23,
      APAC: 0.57,
      MIDDLE_EAST: 0.49,
      AFRICA: 0.61,
      SOUTH_AMERICA: 0.31,
      US: 0.385,
      UK: 0.19,
      DE: 0.34,
      CN: 0.57,
      IN: 0.71,
      PK: 0.42,
      UAE: 0.44,
    },
  },
  scope3: {
    transportKgPerTonKm: {
      ROAD: 0.098,
      RAIL: 0.028,
      AIR: 0.602,
      OCEAN: 0.016,
    },
    supplierRiskByCountry: {
      US: 18,
      CA: 16,
      MX: 34,
      BR: 38,
      UK: 14,
      DE: 12,
      FR: 12,
      NL: 11,
      CN: 48,
      IN: 56,
      PK: 63,
      BD: 59,
      VN: 41,
      TH: 33,
      ID: 43,
      AE: 27,
      SA: 36,
      ZA: 44,
      NG: 65,
      AU: 15,
      JP: 13,
      KR: 17,
      SG: 10,
    },
  },
};

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

function resolveTransportMode(mode) {
  const normalized = normalizeKey(mode);

  if (normalized === "SEA") {
    return "OCEAN";
  }

  return TRANSPORT_MODES.includes(normalized) ? normalized : "ROAD";
}

function resolveFactor(overrides, fallbackMap, key, defaultKey = "GLOBAL") {
  const normalizedKey = normalizeKey(key);

  if (overrides && Number.isFinite(Number(overrides[normalizedKey]))) {
    return Number(overrides[normalizedKey]);
  }

  if (Number.isFinite(Number(fallbackMap[normalizedKey]))) {
    return Number(fallbackMap[normalizedKey]);
  }

  if (Number.isFinite(Number(fallbackMap[defaultKey]))) {
    return Number(fallbackMap[defaultKey]);
  }

  return 0;
}

function toTonnesFromKg(value) {
  return round(Number(value || 0) / 1000);
}

function calculateShipmentEmissions(input = {}, overrides = {}) {
  const distanceKm = Number(input.distanceKm || 0);
  const weightKg = Number(input.weightKg || 0);
  const transportMode = resolveTransportMode(input.transportMode);
  const tonKm = (distanceKm * weightKg) / 1000;
  const factorKgPerTonKm = resolveFactor(
    overrides.transport,
    DEFAULT_EMISSION_FACTORS.scope3.transportKgPerTonKm,
    transportMode,
    "ROAD",
  );
  const kgCo2e = tonKm * factorKgPerTonKm;

  return {
    transportMode,
    distanceKm,
    weightKg,
    tonKm: round(tonKm, 3),
    factorKgPerTonKm: round(factorKgPerTonKm, 3),
    emissionsTonnes: toTonnesFromKg(kgCo2e),
  };
}

function calculateScope1(input = {}, overrides = {}) {
  const fuelFactors = {
    ...DEFAULT_EMISSION_FACTORS.scope1.fuelsKgPerUnit,
    ...(overrides.fuels || {}),
  };
  const fleetFactors = {
    ...DEFAULT_EMISSION_FACTORS.scope1.fleetKgPerKm,
    ...(overrides.fleet || {}),
  };
  const stationaryFuelType = normalizeKey(input.stationaryFuelType || input.fuelType || "DIESEL");
  const fleetFuelType = normalizeKey(input.mobileFuelType || input.vehicleFuelType || stationaryFuelType || "DIESEL");

  const stationaryFuelLiters = Number(input.stationaryFuelLiters || 0);
  const mobileFuelLiters = Number(input.mobileFuelLiters || 0);
  const companyVehicleKm = Number(input.companyVehicleKm || 0);

  const stationaryKg = stationaryFuelLiters * resolveFactor(null, fuelFactors, stationaryFuelType, "DIESEL");
  const mobileFuelKg = mobileFuelLiters * resolveFactor(null, fuelFactors, fleetFuelType, "DIESEL");
  const companyVehiclesKg = companyVehicleKm * resolveFactor(null, fleetFactors, fleetFuelType, "DIESEL");

  const breakdown = [
    {
      key: "stationaryFuel",
      label: "Stationary fuel combustion",
      activity: stationaryFuelLiters,
      unit: "liters",
      factor: round(resolveFactor(null, fuelFactors, stationaryFuelType, "DIESEL"), 3),
      amountTonnes: toTonnesFromKg(stationaryKg),
    },
    {
      key: "mobileFuel",
      label: "Mobile fuel combustion",
      activity: mobileFuelLiters,
      unit: "liters",
      factor: round(resolveFactor(null, fuelFactors, fleetFuelType, "DIESEL"), 3),
      amountTonnes: toTonnesFromKg(mobileFuelKg),
    },
    {
      key: "fleetDistance",
      label: "Company vehicle operations",
      activity: companyVehicleKm,
      unit: "km",
      factor: round(resolveFactor(null, fleetFactors, fleetFuelType, "DIESEL"), 3),
      amountTonnes: toTonnesFromKg(companyVehiclesKg),
    },
  ].filter((item) => item.activity > 0);

  return {
    scope: 1,
    totalTonnes: round(breakdown.reduce((sum, item) => sum + item.amountTonnes, 0)),
    breakdown,
  };
}

function calculateScope2(input = {}, overrides = {}) {
  const electricityKwh = Number(input.electricityConsumptionKwh || input.electricityKwh || 0);
  const renewableElectricityPct = Math.max(0, Math.min(100, Number(input.renewableElectricityPct || input.renewableSharePct || 0)));
  const region = normalizeKey(input.region || input.electricityRegion || "GLOBAL");
  const factorKgPerKwh = resolveFactor(
    overrides.electricity,
    DEFAULT_EMISSION_FACTORS.scope2.electricityKgPerKwh,
    region,
    "GLOBAL",
  );
  const locationBasedKg = electricityKwh * factorKgPerKwh;
  const marketBasedKg = locationBasedKg * (1 - (renewableElectricityPct / 100));

  return {
    scope: 2,
    region,
    electricityKwh: round(electricityKwh, 2),
    renewableElectricityPct: round(renewableElectricityPct, 2),
    factorKgPerKwh: round(factorKgPerKwh, 4),
    locationBasedTonnes: toTonnesFromKg(locationBasedKg),
    marketBasedTonnes: toTonnesFromKg(marketBasedKg),
    totalTonnes: toTonnesFromKg(marketBasedKg),
  };
}

function calculateSupplierRisk(input = {}) {
  const country = normalizeKey(input.country || input.countryCode || "");
  const countryRiskIndex = Number.isFinite(Number(input.countryRiskIndex))
    ? Number(input.countryRiskIndex)
    : resolveFactor(
      null,
      DEFAULT_EMISSION_FACTORS.scope3.supplierRiskByCountry,
      country,
      "GLOBAL",
    ) || 35;
  const complianceScore = Math.max(0, Math.min(100, Number(input.complianceScore ?? 80)));
  const emissionIntensity = Math.max(0, Number(input.emissionIntensity ?? input.emissionFactor ?? 0));
  const normalizedEmissionIntensity = Math.min(100, emissionIntensity * 18);
  const normalizedComplianceGap = 100 - complianceScore;
  const riskScore = round(
    (normalizedEmissionIntensity * 0.45)
      + (countryRiskIndex * 0.25)
      + (normalizedComplianceGap * 0.30),
    2,
  );

  let riskLevel = SUPPLIER_RISK_LEVELS[0];
  if (riskScore >= 70) {
    riskLevel = "HIGH";
  } else if (riskScore >= 40) {
    riskLevel = "MEDIUM";
  }

  return {
    countryRiskIndex: round(countryRiskIndex, 2),
    complianceScore: round(complianceScore, 2),
    emissionIntensity: round(emissionIntensity, 4),
    riskScore,
    riskLevel,
  };
}

function calculateScope3(input = {}, overrides = {}) {
  const shipments = Array.isArray(input.shipments) ? input.shipments : [];
  const suppliers = Array.isArray(input.suppliers) ? input.suppliers : [];

  const shipmentBreakdown = shipments.map((shipment) => ({
    sourceType: "SHIPMENT",
    sourceId: String(shipment.id || shipment._id || ""),
    ...calculateShipmentEmissions(shipment, overrides),
  }));

  const supplierBreakdown = suppliers.map((supplier) => ({
    sourceType: "SUPPLIER",
    sourceId: String(supplier.id || supplier._id || ""),
    amountTonnes: round(Number(supplier.totalEmissions || 0)),
    emissionIntensity: round(Number(supplier.emissionIntensity ?? supplier.emissionFactor ?? 0), 4),
    category: supplier.category || "Supplier",
  }));

  const shipmentTonnes = shipmentBreakdown.reduce((sum, item) => sum + item.emissionsTonnes, 0);
  const supplierTonnes = supplierBreakdown.reduce((sum, item) => sum + item.amountTonnes, 0);

  return {
    scope: 3,
    totalTonnes: round(shipmentTonnes + supplierTonnes),
    shipmentsTonnes: round(shipmentTonnes),
    suppliersTonnes: round(supplierTonnes),
    breakdown: {
      shipments: shipmentBreakdown,
      suppliers: supplierBreakdown,
    },
  };
}

module.exports = {
  DEFAULT_EMISSION_FACTORS,
  resolveTransportMode,
  calculateShipmentEmissions,
  calculateScope1,
  calculateScope2,
  calculateScope3,
  calculateSupplierRisk,
  round,
};
