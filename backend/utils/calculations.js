const DEFAULT_CARBON_PRICE = 55;

const TRANSPORT_FACTORS = {
  ROAD: 0.12,
  RAIL: 0.035,
  AIR: 0.65,
  OCEAN: 0.018,
};

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function calculateShipmentEmissions({ distanceKm, weightKg, transportMode }) {
  const factor = TRANSPORT_FACTORS[transportMode] || TRANSPORT_FACTORS.ROAD;
  const tonKm = (Number(distanceKm || 0) * Number(weightKg || 0)) / 1000;
  return round((tonKm * factor) / 1000, 4);
}

function calculateCarbonCost(emissionsTonnes, carbonPricePerTon = DEFAULT_CARBON_PRICE) {
  return round(Number(emissionsTonnes || 0) * Number(carbonPricePerTon || DEFAULT_CARBON_PRICE));
}

function calculateSupplierRisk({ carbonScore, totalEmissions, onTimeDeliveryRate, complianceFlags }) {
  const scorePenalty = Math.max(0, 100 - Number(carbonScore || 0)) * 0.45;
  const emissionPenalty = Math.min(Number(totalEmissions || 0) / 150, 25);
  const deliveryPenalty = Math.max(0, 95 - Number(onTimeDeliveryRate || 0)) * 0.6;
  const compliancePenalty = Number(complianceFlags || 0) * 8;
  const riskScore = round(Math.min(scorePenalty + emissionPenalty + deliveryPenalty + compliancePenalty, 100));

  let riskLevel = "LOW";
  if (riskScore >= 70) riskLevel = "HIGH";
  else if (riskScore >= 40) riskLevel = "MEDIUM";

  return { riskScore, riskLevel };
}

function calculateCarbonScore({ baselineScore = 100, totalEmissions, renewableRatio, complianceFlags }) {
  const emissionPenalty = Math.min(Number(totalEmissions || 0) / 180, 35);
  const renewableBonus = Math.min(Number(renewableRatio || 0) * 20, 12);
  const compliancePenalty = Number(complianceFlags || 0) * 6;
  return round(Math.max(0, Math.min(100, baselineScore - emissionPenalty - compliancePenalty + renewableBonus)));
}

module.exports = {
  TRANSPORT_FACTORS,
  calculateShipmentEmissions,
  calculateCarbonCost,
  calculateSupplierRisk,
  calculateCarbonScore,
  round,
};
