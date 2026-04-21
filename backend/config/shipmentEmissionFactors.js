// @ts-check

const SHIPMENT_EMISSIONS_CONFIG = Object.freeze({
  defaultEmissionFactorSource: "GLEC",
  calculationPrecision: 4,
  distance: Object.freeze({
    fallbackKm: 100,
  }),
  transportModes: Object.freeze(["Air", "Sea", "Road", "Rail"]),
  emissionFactorSources: Object.freeze(["GLEC", "DEFRA", "EPA"]),
  transportModeAliases: Object.freeze({
    AIR: "Air",
    SEA: "Sea",
    OCEAN: "Sea",
    ROAD: "Road",
    RAIL: "Rail",
  }),
  emissionFactorSourceAliases: Object.freeze({
    GLEC: "GLEC",
    DEFRA: "DEFRA",
    EPA: "EPA",
  }),
  scenarioComparison: Object.freeze({
    preferredAirAlternativeMode: "Sea",
  }),
  standards: Object.freeze({
    GLEC: Object.freeze({
      Air: 0.602,
      Sea: 0.016,
      Road: 0.098,
      Rail: 0.028,
    }),
    DEFRA: Object.freeze({
      Air: 0.654,
      Sea: 0.018,
      Road: 0.109,
      Rail: 0.031,
    }),
    EPA: Object.freeze({
      Air: 0.594,
      Sea: 0.017,
      Road: 0.093,
      Rail: 0.024,
    }),
  }),
});

function normalizeLookupKey(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\s_-]+/g, "")
    .toUpperCase();
}

function normalizeTransportMode(value) {
  const normalizedKey = normalizeLookupKey(value);
  return SHIPMENT_EMISSIONS_CONFIG.transportModeAliases[normalizedKey] || null;
}

function normalizeEmissionFactorSource(value) {
  const normalizedKey = normalizeLookupKey(
    value || SHIPMENT_EMISSIONS_CONFIG.defaultEmissionFactorSource,
  );

  return SHIPMENT_EMISSIONS_CONFIG.emissionFactorSourceAliases[normalizedKey] || null;
}

function getFactorMapForSource(source) {
  const normalizedSource = normalizeEmissionFactorSource(source);

  if (!normalizedSource) {
    return null;
  }

  return SHIPMENT_EMISSIONS_CONFIG.standards[normalizedSource] || null;
}

function getEmissionFactor(source, transportMode) {
  const factorMap = getFactorMapForSource(source);
  const normalizedMode = normalizeTransportMode(transportMode);

  if (!factorMap || !normalizedMode) {
    return null;
  }

  const factor = factorMap[normalizedMode];
  return Number.isFinite(Number(factor)) ? Number(factor) : null;
}

function getLowestEmissionMode(source) {
  const factorMap = getFactorMapForSource(source);

  if (!factorMap) {
    return null;
  }

  return [...SHIPMENT_EMISSIONS_CONFIG.transportModes]
    .sort((leftMode, rightMode) => {
      const leftFactor = Number(factorMap[leftMode] ?? Number.POSITIVE_INFINITY);
      const rightFactor = Number(factorMap[rightMode] ?? Number.POSITIVE_INFINITY);
      return leftFactor - rightFactor;
    })[0] || null;
}

module.exports = {
  SHIPMENT_EMISSIONS_CONFIG,
  getEmissionFactor,
  getFactorMapForSource,
  getLowestEmissionMode,
  normalizeEmissionFactorSource,
  normalizeTransportMode,
};
