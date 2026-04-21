const { Shipment, Supplier } = require("../models");
const ApiError = require("../utils/ApiError");
const { calculateShipmentEmissions, round } = require("../utils/calculations");

const MAX_RECOMMENDATIONS = 5;

const CONSOLIDATION_PROFILES = {
  AIR: { emissionsRate: 0.22, costRate: 0.12 },
  ROAD: { emissionsRate: 0.14, costRate: 0.08 },
  RAIL: { emissionsRate: 0.1, costRate: 0.05 },
  OCEAN: { emissionsRate: 0.16, costRate: 0.09 },
};

const MODE_SWITCH_PROFILES = {
  AIR: {
    targetMode: "OCEAN",
    minDistanceKm: 1600,
    baseShiftShare: 0.45,
    costMultiplier: 0.74,
  },
  ROAD: {
    targetMode: "RAIL",
    minDistanceKm: 700,
    baseShiftShare: 0.35,
    costMultiplier: 0.91,
  },
};

function normalizeQuery(query) {
  return String(query || "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getEntityId(record) {
  return String(record?.id || record?._id || "");
}

function escapeUrlSearchTerm(value) {
  return encodeURIComponent(String(value || "").trim());
}

function toTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildIntentProfile(query) {
  const normalized = query.toLowerCase();

  return {
    focusesRoutes: /(route|routes|lane|lanes|consolidat|emit|emission|top|origin|destination)/.test(normalized),
    focusesCarriers: /(carrier|fleet|switch|benchmark|compare)/.test(normalized),
    focusesCost: /(cost|saving|savings|margin|analysis|roi)/.test(normalized),
    focusesModes: /(air|ocean|rail|road|modal|mode|vs|versus)/.test(normalized),
    focusesSuppliers: /(supplier|suppliers|vendor|vendors|procurement|scope 3)/.test(normalized),
  };
}

function getShipmentEmissions(shipment) {
  if (Number.isFinite(Number(shipment.emissionsTonnes)) && Number(shipment.emissionsTonnes) > 0) {
    return round(shipment.emissionsTonnes, 4);
  }

  return round(calculateShipmentEmissions(shipment), 4);
}

function calculateEmissions(shipment, overrides = {}) {
  return round(calculateShipmentEmissions({ ...shipment, ...overrides }), 4);
}

function estimateCostSavings(currentCost, optimizedCost) {
  return round(Number(optimizedCost || 0) - Number(currentCost || 0));
}

function getTonKm(shipment) {
  return (Number(shipment.distanceKm || 0) * Number(shipment.weightKg || 0)) / 1000;
}

function impactLevelFromReduction(emissionReduction) {
  const absoluteReduction = Math.abs(Number(emissionReduction || 0));

  if (absoluteReduction >= 25) {
    return "High";
  }

  if (absoluteReduction >= 8) {
    return "Medium";
  }

  return "Low";
}

function buildRecommendationScore(recommendation, intent) {
  const reductionScore = Math.abs(recommendation.emissionReduction) * 4;
  const savingsScore = recommendation.costImpact < 0 ? Math.min(Math.abs(recommendation.costImpact) / 250, 28) : Math.max(-recommendation.costImpact / 600, -12);

  let intentBoost = 0;
  if (intent.focusesRoutes && recommendation.type === "Route Optimization") intentBoost += 18;
  if (intent.focusesCarriers && recommendation.type === "Carrier Switch") intentBoost += 20;
  if (intent.focusesSuppliers && recommendation.type === "Supplier Collaboration") intentBoost += 20;
  if (intent.focusesModes && /AIR|OCEAN|RAIL|ROAD/.test(recommendation.description)) intentBoost += 16;
  if (intent.focusesCost && recommendation.costImpact <= 0) intentBoost += 10;

  return reductionScore + savingsScore + intentBoost;
}

function sortAndLimitRecommendations(recommendations, intent) {
  const seen = new Set();

  return recommendations
    .filter((recommendation) => recommendation && Math.abs(Number(recommendation.emissionReduction || 0)) >= 0.5)
    .map((recommendation) => ({
      ...recommendation,
      impactLevel: impactLevelFromReduction(recommendation.emissionReduction),
      _score: buildRecommendationScore(recommendation, intent),
    }))
    .sort((left, right) => right._score - left._score)
    .filter((recommendation) => {
      const key = `${recommendation.type}:${recommendation.title}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, MAX_RECOMMENDATIONS)
    .map(({ _score, ...recommendation }) => recommendation);
}

function buildCarrierBenchmarks(shipments) {
  const benchmarks = new Map();

  shipments.forEach((shipment) => {
    const mode = shipment.transportMode;
    const carrier = String(shipment.carrier || "").trim();
    const tonKm = getTonKm(shipment);

    if (!mode || !carrier || tonKm <= 0) {
      return;
    }

    const key = `${mode}:${carrier}`;
    const current = benchmarks.get(key) || {
      mode,
      carrier,
      shipmentCount: 0,
      totalTonKm: 0,
      totalEmissions: 0,
      totalCost: 0,
    };

    current.shipmentCount += 1;
    current.totalTonKm += tonKm;
    current.totalEmissions += getShipmentEmissions(shipment);
    current.totalCost += Number(shipment.costUsd || 0);

    benchmarks.set(key, current);
  });

  return Array.from(benchmarks.values())
    .filter((benchmark) => benchmark.shipmentCount >= 2 && benchmark.totalTonKm > 0)
    .map((benchmark) => ({
      ...benchmark,
      emissionIntensity: benchmark.totalEmissions / benchmark.totalTonKm,
      costIntensity: benchmark.totalCost / benchmark.totalTonKm,
    }));
}

function buildRouteGroups(shipments, suppliersById) {
  const routeMap = new Map();

  shipments.forEach((shipment) => {
    const key = [shipment.origin, shipment.destination, shipment.transportMode].join("|");
    const carrier = String(shipment.carrier || "").trim() || "Unassigned Carrier";
    const supplier = suppliersById.get(shipment.supplierId);
    const emission = getShipmentEmissions(shipment);
    const tonKm = getTonKm(shipment);

    if (!routeMap.has(key)) {
      routeMap.set(key, {
        key,
        origin: shipment.origin,
        destination: shipment.destination,
        transportMode: shipment.transportMode,
        shipmentCount: 0,
        totalCost: 0,
        totalEmissions: 0,
        totalDistanceKm: 0,
        totalWeightKg: 0,
        totalTonKm: 0,
        supplierIds: new Set(),
        carriers: new Map(),
        shipments: [],
      });
    }

    const route = routeMap.get(key);
    route.shipmentCount += 1;
    route.totalCost += Number(shipment.costUsd || 0);
    route.totalEmissions += emission;
    route.totalDistanceKm += Number(shipment.distanceKm || 0);
    route.totalWeightKg += Number(shipment.weightKg || 0);
    route.totalTonKm += tonKm;
    route.shipments.push(shipment);

    if (shipment.supplierId) {
      route.supplierIds.add(shipment.supplierId);
    }

    const carrierRecord = route.carriers.get(carrier) || {
      carrier,
      shipmentCount: 0,
      totalCost: 0,
      totalEmissions: 0,
      totalTonKm: 0,
    };

    carrierRecord.shipmentCount += 1;
    carrierRecord.totalCost += Number(shipment.costUsd || 0);
    carrierRecord.totalEmissions += emission;
    carrierRecord.totalTonKm += tonKm;
    route.carriers.set(carrier, carrierRecord);

    if (supplier) {
      route.primarySupplierName = route.primarySupplierName || supplier.name;
    }
  });

  return Array.from(routeMap.values())
    .map((route) => {
      const carrierBreakdown = Array.from(route.carriers.values()).sort((left, right) => right.totalEmissions - left.totalEmissions);

      return {
        ...route,
        supplierCount: route.supplierIds.size,
        averageDistanceKm: route.shipmentCount ? route.totalDistanceKm / route.shipmentCount : 0,
        averageWeightKg: route.shipmentCount ? route.totalWeightKg / route.shipmentCount : 0,
        primaryCarrier: carrierBreakdown[0] || null,
        carrierBreakdown,
      };
    })
    .sort((left, right) => right.totalEmissions - left.totalEmissions);
}

function analyzeRoutes(context) {
  const { routes, intent } = context;
  const recommendations = [];

  routes.forEach((route) => {
    if (route.shipmentCount < 2 || route.totalEmissions < 1) {
      return;
    }

    const profile = CONSOLIDATION_PROFILES[route.transportMode] || CONSOLIDATION_PROFILES.ROAD;
    const scalingFactor = Math.min(0.38, profile.emissionsRate + Math.max(0, route.shipmentCount - 2) * 0.025);
    const costFactor = Math.min(0.24, profile.costRate + Math.max(0, route.shipmentCount - 2) * 0.012);
    const optimizedEmissions = route.totalEmissions * (1 - scalingFactor);
    const optimizedCost = route.totalCost * (1 - costFactor);
    const optimizedDepartureCount = Math.max(1, Math.ceil(route.shipmentCount * 0.45));

    recommendations.push({
      id: `route_${route.transportMode.toLowerCase()}_${escapeUrlSearchTerm(route.origin)}_${escapeUrlSearchTerm(route.destination)}`,
      title: `Consolidate ${route.origin} to ${route.destination} shipments`,
      type: "Route Optimization",
      description: `${route.shipmentCount} ${route.transportMode} shipments currently move across this lane. Consolidating into about ${optimizedDepartureCount} fuller departures can reduce duplicated handling and cut unused freight capacity.`,
      emissionReduction: round(optimizedEmissions - route.totalEmissions),
      costImpact: estimateCostSavings(route.totalCost, optimizedCost),
      actionLabel: "Review matching shipments",
      actionUrl: `/app/shipments?search=${escapeUrlSearchTerm(route.origin)}`,
    });

    const modeSwitch = MODE_SWITCH_PROFILES[route.transportMode];
    if (!modeSwitch || route.averageDistanceKm < modeSwitch.minDistanceKm) {
      return;
    }

    const requestedModeComparison = intent.focusesModes || intent.focusesCost;
    const shiftShare = Math.min(0.7, modeSwitch.baseShiftShare + (requestedModeComparison ? 0.15 : 0));

    const modeShiftEmissions = route.shipments.reduce((sum, shipment) => {
      const currentEmission = getShipmentEmissions(shipment);
      const alternativeEmission = calculateEmissions(shipment, { transportMode: modeSwitch.targetMode });
      return sum + (currentEmission * (1 - shiftShare)) + (alternativeEmission * shiftShare);
    }, 0);

    const modeShiftCost = route.shipments.reduce((sum, shipment) => {
      const currentCost = Number(shipment.costUsd || 0);
      return sum + (currentCost * (1 - shiftShare)) + (currentCost * modeSwitch.costMultiplier * shiftShare);
    }, 0);

    recommendations.push({
      id: `mode_shift_${route.transportMode.toLowerCase()}_${escapeUrlSearchTerm(route.origin)}_${escapeUrlSearchTerm(route.destination)}`,
      title: `Shift part of ${route.origin} to ${route.destination} volume from ${toTitleCase(route.transportMode)} to ${toTitleCase(modeSwitch.targetMode)}`,
      type: "Route Optimization",
      description: `This lane averages ${Math.round(route.averageDistanceKm).toLocaleString()} km per shipment. Moving ${Math.round(shiftShare * 100)}% of the current ${route.transportMode} volume to ${modeSwitch.targetMode} provides the strongest cost-carbon tradeoff in your shipment history.`,
      emissionReduction: round(modeShiftEmissions - route.totalEmissions),
      costImpact: estimateCostSavings(route.totalCost, modeShiftCost),
      actionLabel: "Run route comparison",
      actionUrl: `/app/shipments?search=${escapeUrlSearchTerm(route.destination)}`,
    });
  });

  return recommendations;
}

function compareCarriers(context) {
  const { routes, carrierBenchmarks } = context;
  const recommendations = [];

  routes.forEach((route) => {
    if (!route.primaryCarrier || route.primaryCarrier.totalTonKm <= 0) {
      return;
    }

    const currentCarrier = route.primaryCarrier;
    const candidates = carrierBenchmarks
      .filter((benchmark) => benchmark.mode === route.transportMode && benchmark.carrier !== currentCarrier.carrier)
      .sort((left, right) => {
        if (left.emissionIntensity !== right.emissionIntensity) {
          return left.emissionIntensity - right.emissionIntensity;
        }

        return left.costIntensity - right.costIntensity;
      });

    const bestAlternative = candidates.find((candidate) => {
      const emissionImprovement = currentCarrier.totalTonKm
        ? (currentCarrier.totalEmissions / currentCarrier.totalTonKm) - candidate.emissionIntensity
        : 0;
      const costChange = candidate.costIntensity - (currentCarrier.totalCost / currentCarrier.totalTonKm);

      return emissionImprovement > 0.0008 && costChange <= 0.12;
    });

    if (!bestAlternative) {
      return;
    }

    const optimizedEmissions = route.totalEmissions - currentCarrier.totalEmissions + (currentCarrier.totalTonKm * bestAlternative.emissionIntensity);
    const optimizedCost = route.totalCost - currentCarrier.totalCost + (currentCarrier.totalTonKm * bestAlternative.costIntensity);
    const currentIntensity = currentCarrier.totalEmissions / currentCarrier.totalTonKm;
    const emissionImprovementPct = currentIntensity > 0
      ? Math.round(((currentIntensity - bestAlternative.emissionIntensity) / currentIntensity) * 100)
      : 0;

    recommendations.push({
      id: `carrier_${escapeUrlSearchTerm(currentCarrier.carrier)}_${escapeUrlSearchTerm(bestAlternative.carrier)}_${escapeUrlSearchTerm(route.origin)}`,
      title: `Switch ${route.origin} to ${route.destination} volume from ${currentCarrier.carrier} to ${bestAlternative.carrier}`,
      type: "Carrier Switch",
      description: `${bestAlternative.carrier} is outperforming ${currentCarrier.carrier} by about ${emissionImprovementPct}% on comparable ${route.transportMode} shipments in your dataset, with ${bestAlternative.shipmentCount} benchmark loads informing the comparison.`,
      emissionReduction: round(optimizedEmissions - route.totalEmissions),
      costImpact: estimateCostSavings(route.totalCost, optimizedCost),
      actionLabel: "Compare carrier performance",
      actionUrl: `/app/shipments?search=${escapeUrlSearchTerm(currentCarrier.carrier)}`,
    });
  });

  return recommendations;
}

function analyzeSuppliers(context) {
  const { shipments, suppliers, suppliersById } = context;
  const supplierGroups = new Map();

  shipments.forEach((shipment) => {
    const supplier = suppliersById.get(shipment.supplierId);
    if (!supplier) {
      return;
    }

    const supplierId = getEntityId(supplier);
    const current = supplierGroups.get(supplierId) || {
      supplier,
      shipmentCount: 0,
      totalEmissions: 0,
      totalCost: 0,
    };

    current.shipmentCount += 1;
    current.totalEmissions += getShipmentEmissions(shipment);
    current.totalCost += Number(shipment.costUsd || 0);

    supplierGroups.set(supplierId, current);
  });

  return Array.from(supplierGroups.values()).flatMap((group) => {
    const { supplier } = group;

    if (group.shipmentCount < 2 || group.totalEmissions < 1) {
      return [];
    }

    const alternative = suppliers
      .filter((candidate) => getEntityId(candidate) !== getEntityId(supplier))
      .filter((candidate) => candidate.category === supplier.category || candidate.region === supplier.region)
      .filter((candidate) => Number(candidate.carbonScore || 0) >= Number(supplier.carbonScore || 0) + 8)
      .filter((candidate) => Number(candidate.renewableRatio || 0) >= Number(supplier.renewableRatio || 0))
      .sort((left, right) => {
        if (right.carbonScore !== left.carbonScore) {
          return right.carbonScore - left.carbonScore;
        }

        return (right.renewableRatio || 0) - (left.renewableRatio || 0);
      })[0];

    if (!alternative) {
      return [];
    }

    const shiftShare = supplier.riskLevel === "HIGH" ? 0.35 : 0.22;
    const supplierAdvantage = Math.max(
      0.1,
      Math.min(
        0.34,
        ((Number(alternative.carbonScore || 0) - Number(supplier.carbonScore || 0)) / 100) * 0.45
          + ((Number(alternative.renewableRatio || 0) - Number(supplier.renewableRatio || 0))) * 0.25,
      ),
    );
    const emissionReduction = round(-(group.totalEmissions * shiftShare * supplierAdvantage));
    const costImpact = round(group.totalCost * shiftShare * (alternative.onTimeDeliveryRate >= supplier.onTimeDeliveryRate ? -0.03 : 0.02));

    return [{
      id: `supplier_${escapeUrlSearchTerm(supplier.name)}_${escapeUrlSearchTerm(alternative.name)}`,
      title: `Rebalance ${supplier.name} volume toward ${alternative.name}`,
      type: "Supplier Collaboration",
      description: `${supplier.name} is responsible for ${group.shipmentCount} shipments in this planning window. Moving ${Math.round(shiftShare * 100)}% of comparable volume to ${alternative.name} lowers supplier-side Scope 3 exposure and improves resilience.`,
      emissionReduction,
      costImpact,
      actionLabel: "Review supplier mix",
      actionUrl: `/app/suppliers?search=${escapeUrlSearchTerm(supplier.name)}`,
    }];
  });
}

function buildSummary({ shipments, suppliers, routes, recommendations }) {
  const totalBaselineEmissions = round(shipments.reduce((sum, shipment) => sum + getShipmentEmissions(shipment), 0));
  const totalBaselineCost = round(shipments.reduce((sum, shipment) => sum + Number(shipment.costUsd || 0), 0));
  const totalPotentialEmissionReduction = round(
    recommendations.reduce((sum, recommendation) => sum + Math.abs(Math.min(Number(recommendation.emissionReduction || 0), 0)), 0),
  );
  const totalPotentialCostImpact = round(
    recommendations.reduce((sum, recommendation) => sum + Number(recommendation.costImpact || 0), 0),
  );

  return {
    shipmentsAnalyzed: shipments.length,
    suppliersAnalyzed: suppliers.length,
    routesAnalyzed: routes.length,
    carriersAnalyzed: new Set(shipments.map((shipment) => shipment.carrier).filter(Boolean)).size,
    totalBaselineEmissions,
    totalBaselineCost,
    potentialEmissionReduction: totalPotentialEmissionReduction,
    potentialCostImpact: totalPotentialCostImpact,
    generatedAt: new Date().toISOString(),
  };
}

class OptimizationService {
  static async analyze(query, companyId) {
    const normalizedQuery = normalizeQuery(query);

    if (!normalizedQuery) {
      throw new ApiError(400, "Query is required");
    }

    const [shipments, suppliers] = await Promise.all([
      Shipment.find({ companyId })
        .select("supplierId reference origin destination distanceKm transportMode carrier weightKg costUsd emissionsTonnes status createdAt")
        .lean(),
      Supplier.find({ companyId })
        .select("name region category renewableRatio carbonScore riskLevel onTimeDeliveryRate totalEmissions")
        .lean(),
    ]);

    const suppliersById = new Map(suppliers.map((supplier) => [getEntityId(supplier), supplier]));
    const routes = buildRouteGroups(shipments, suppliersById);
    const intent = buildIntentProfile(normalizedQuery);
    const carrierBenchmarks = buildCarrierBenchmarks(shipments);

    const recommendations = sortAndLimitRecommendations([
      ...analyzeRoutes({ routes, intent }),
      ...compareCarriers({ routes, carrierBenchmarks }),
      ...analyzeSuppliers({ shipments, suppliers, suppliersById }),
    ], intent);

    return {
      query: normalizedQuery,
      recommendations,
      summary: buildSummary({
        shipments,
        suppliers,
        routes,
        recommendations,
      }),
    };
  }
}

OptimizationService.analyzeRoutes = analyzeRoutes;
OptimizationService.compareCarriers = compareCarriers;
OptimizationService.calculateEmissions = calculateEmissions;
OptimizationService.estimateCostSavings = estimateCostSavings;

module.exports = OptimizationService;
