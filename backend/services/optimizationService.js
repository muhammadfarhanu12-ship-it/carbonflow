const { randomUUID } = require("crypto");
const PDFDocument = require("pdfkit");
const {
  Company,
  EmissionRecord,
  LedgerEntry,
  OptimizationRecommendation,
  OptimizationRun,
  Shipment,
  Supplier,
} = require("../models");
const ApiError = require("../utils/ApiError");
const AuditService = require("./audit.service");
const { getOptimizationAiConfig } = require("../config/optimizationAi");

const MAX_RECOMMENDATIONS = 12;
const SAVINGS_UNAVAILABLE = "Insufficient data to estimate savings";
const ANALYSIS_MODE = "rule_based";

const MODE_SHIFT_FACTORS = {
  AIR: { targetMode: "OCEAN", minDistanceKm: 1500, reductionRate: 0.72, costMultiplier: 0.75, shiftShare: 0.45 },
  ROAD: { targetMode: "RAIL", minDistanceKm: 650, reductionRate: 0.35, costMultiplier: 0.9, shiftShare: 0.35 },
};

function round(value, precision = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** precision;
  return Math.round(number * factor) / factor;
}

function normalizeQuery(query) {
  return String(query || "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function getId(record) {
  return String(record?._id || record?.id || "");
}

function getShipmentEmissions(shipment) {
  return Number(shipment?.emissionsTonnes || shipment?.emissionsTCo2e || 0);
}

function getShipmentCost(shipment) {
  return Number(shipment?.costUsd || shipment?.carbonCostUsd || 0);
}

function sanitizeCsvCell(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function getTonKm(shipment) {
  return (Number(shipment?.distanceKm || 0) * Number(shipment?.weightKg || 0)) / 1000;
}

function dateFilter(field, dateRange = {}) {
  const filter = {};
  const start = dateRange.start || dateRange.from || dateRange.startDate;
  const end = dateRange.end || dateRange.to || dateRange.endDate;

  if (start || end) {
    filter[field] = {};
    if (start && !Number.isNaN(new Date(start).getTime())) filter[field].$gte = new Date(start);
    if (end && !Number.isNaN(new Date(end).getTime())) filter[field].$lte = new Date(end);
  }

  return filter;
}

function shipmentFilter(companyId, { dateRange = {}, filters = {} } = {}) {
  const filter = { companyId, ...dateFilter("shipmentDate", dateRange) };
  if (filters.route) {
    const [origin, destination] = String(filters.route).split(/\s*(?:->|to)\s*/i);
    if (origin) filter.origin = new RegExp(origin.trim(), "i");
    if (destination) filter.destination = new RegExp(destination.trim(), "i");
  }
  if (filters.carrier) filter.carrier = new RegExp(String(filters.carrier).trim(), "i");
  if (filters.supplier) filter.supplierId = String(filters.supplier);
  if (filters.mode) filter.transportMode = String(filters.mode).toUpperCase();
  return filter;
}

function supplierFilter(companyId, { filters = {} } = {}) {
  const filter = { companyId };
  if (filters.supplier) {
    filter.$or = [
      { _id: String(filters.supplier) },
      { name: new RegExp(String(filters.supplier).trim(), "i") },
    ];
  }
  return filter;
}

function buildDataQualityIssues({ shipments, suppliers, emissionRecords, ledgerEntries }) {
  const issues = [];
  const missingShipmentCost = shipments.filter((shipment) => !Number.isFinite(Number(shipment.costUsd)) || Number(shipment.costUsd) <= 0).length;
  const missingShipmentEmissions = shipments.filter((shipment) => getShipmentEmissions(shipment) <= 0).length;
  const missingShipmentDistance = shipments.filter((shipment) => Number(shipment.distanceKm || 0) <= 0).length;
  const missingSupplierData = suppliers.filter((supplier) => {
    return Number(supplier.dataTransparencyScore || 0) <= 0
      || !supplier.lastReportedAt
      || Number(supplier.totalEmissionsTco2e || supplier.totalEmissions || 0) <= 0;
  }).length;
  const sampleFactors = emissionRecords.filter((record) => record.factorIsSample).length;
  const zeroRecords = emissionRecords.filter((record) => Number(record.amountTonnes || record.emissionsTCo2e || 0) <= 0).length;
  const unapprovedRecords = emissionRecords.filter((record) => record.dataStatus !== "approved").length;
  const zeroLedger = ledgerEntries.filter((entry) => Number(entry.emissionsTonnes || entry.totalCostUsd || entry.carbonCostUsd || 0) <= 0).length;

  if (missingShipmentCost) issues.push({ code: "missing_shipment_cost", severity: "medium", message: `${missingShipmentCost} shipments are missing usable cost data.` });
  if (missingShipmentEmissions) issues.push({ code: "missing_shipment_emissions", severity: "high", message: `${missingShipmentEmissions} shipments have zero or missing emissions.` });
  if (missingShipmentDistance) issues.push({ code: "missing_shipment_distance", severity: "high", message: `${missingShipmentDistance} shipments are missing usable distance data.` });
  if (missingSupplierData) issues.push({ code: "missing_supplier_esg", severity: "medium", message: `${missingSupplierData} suppliers have incomplete ESG or emissions data.` });
  if (sampleFactors) issues.push({ code: "sample_factors", severity: "medium", message: `${sampleFactors} carbon ledger records use sample emission factors.` });
  if (zeroRecords) issues.push({ code: "zero_emission_records", severity: "medium", message: `${zeroRecords} emission records have zero activity or emissions.` });
  if (unapprovedRecords) issues.push({ code: "unapproved_records", severity: "high", message: `${unapprovedRecords} emission records are not approved.` });
  if (zeroLedger) issues.push({ code: "ledger_zero_values", severity: "low", message: `${zeroLedger} ledger entries have no measurable cost or emissions values.` });

  return issues;
}

function buildRouteGroups(shipments) {
  const groups = new Map();

  shipments.forEach((shipment) => {
    const origin = String(shipment.origin || "Unknown origin").trim();
    const destination = String(shipment.destination || "Unknown destination").trim();
    const mode = String(shipment.transportMode || "UNKNOWN").trim().toUpperCase();
    const key = `${origin}|${destination}|${mode}`;
    const current = groups.get(key) || {
      origin,
      destination,
      mode,
      shipments: [],
      carriers: new Map(),
      totalEmissions: 0,
      totalCost: 0,
      totalTonKm: 0,
      totalDistanceKm: 0,
      totalWeightKg: 0,
    };

    const carrier = String(shipment.carrier || "Unassigned").trim();
    const carrierStats = current.carriers.get(carrier) || { carrier, count: 0, emissions: 0, cost: 0, tonKm: 0 };
    const emissions = getShipmentEmissions(shipment);
    const cost = getShipmentCost(shipment);
    const tonKm = getTonKm(shipment);

    current.shipments.push(shipment);
    current.totalEmissions += emissions;
    current.totalCost += cost;
    current.totalTonKm += tonKm;
    current.totalDistanceKm += Number(shipment.distanceKm || 0);
    current.totalWeightKg += Number(shipment.weightKg || 0);
    carrierStats.count += 1;
    carrierStats.emissions += emissions;
    carrierStats.cost += cost;
    carrierStats.tonKm += tonKm;
    current.carriers.set(carrier, carrierStats);
    groups.set(key, current);
  });

  return Array.from(groups.values()).map((route) => ({
    ...route,
    shipmentCount: route.shipments.length,
    averageDistanceKm: route.shipments.length ? route.totalDistanceKm / route.shipments.length : 0,
    averageWeightKg: route.shipments.length ? route.totalWeightKg / route.shipments.length : 0,
    carrierStats: Array.from(route.carriers.values()),
  })).sort((left, right) => right.totalEmissions - left.totalEmissions);
}

function makeRecommendation(fields) {
  const now = new Date().toISOString();
  return {
    recommendationId: fields.recommendationId || `rec_${randomUUID()}`,
    title: fields.title,
    category: fields.category,
    priority: fields.priority || "medium",
    estimatedTco2eSavings: fields.estimatedTco2eSavings ?? null,
    estimatedCostImpact: fields.estimatedCostImpact ?? null,
    confidenceScore: round(fields.confidenceScore ?? 0.6, 2),
    effortLevel: fields.effortLevel || "medium",
    implementationTimeframe: fields.implementationTimeframe || "30-90 days",
    affectedRecordsCount: fields.affectedRecordsCount || 0,
    affectedShipments: fields.affectedShipments || [],
    affectedSuppliers: fields.affectedSuppliers || [],
    explanation: fields.explanation,
    assumptions: fields.assumptions || [],
    requiredData: fields.requiredData || [],
    nextActions: fields.nextActions || [],
    dataUsed: fields.dataUsed || [],
    calculationBasis: fields.calculationBasis || SAVINGS_UNAVAILABLE,
    status: fields.status || "suggested",
    createdAt: now,
  };
}

function analyzeRoutes(routes) {
  return routes.flatMap((route) => {
    const recommendations = [];
    if (route.shipmentCount >= 3 && route.totalEmissions > 0 && route.totalTonKm > 0) {
      const hasCost = route.totalCost > 0;
      const estimatedSavings = round(route.totalEmissions * Math.min(0.22, 0.08 + route.shipmentCount * 0.015));
      recommendations.push(makeRecommendation({
        recommendationId: `route_${route.origin}_${route.destination}_${route.mode}`.replace(/[^a-z0-9]+/gi, "_").toLowerCase(),
        title: `Consolidate repeated ${route.origin} to ${route.destination} ${route.mode} shipments`,
        category: "route",
        priority: route.totalEmissions >= 25 ? "high" : "medium",
        estimatedTco2eSavings: estimatedSavings,
        estimatedCostImpact: hasCost ? round(-route.totalCost * 0.06) : null,
        confidenceScore: route.shipmentCount >= 6 ? 0.78 : 0.65,
        effortLevel: "medium",
        implementationTimeframe: "30-60 days",
        affectedRecordsCount: route.shipmentCount,
        affectedShipments: route.shipments.slice(0, 20).map((shipment) => getId(shipment)),
        explanation: `${route.shipmentCount} real shipments on this lane account for ${round(route.totalEmissions)} tCO2e. Consolidation is recommended because the lane repeats enough times to support load planning.`,
        assumptions: ["Savings use a conservative consolidation factor derived from observed repeated shipment count.", hasCost ? "Cost impact uses recorded shipment cost." : SAVINGS_UNAVAILABLE],
        requiredData: ["shipment origin", "shipment destination", "transport mode", "distance", "weight", "emissions", "shipment cost"],
        nextActions: ["Review dispatch frequency and load factors.", "Group compatible shipment windows.", "Create a route consolidation plan with operations."],
        dataUsed: [`${route.shipmentCount} shipments`, `${route.carrierStats.length} carriers`, `${round(route.totalTonKm)} tonne-km`],
        calculationBasis: `estimated savings = ${round(route.totalEmissions)} tCO2e x conservative consolidation factor`,
      }));
    }

    const profile = MODE_SHIFT_FACTORS[route.mode];
    if (profile && route.averageDistanceKm >= profile.minDistanceKm && route.totalEmissions > 0 && route.totalTonKm > 0) {
      const hasCost = route.totalCost > 0;
      recommendations.push(makeRecommendation({
        recommendationId: `mode_${route.origin}_${route.destination}_${route.mode}_${profile.targetMode}`.replace(/[^a-z0-9]+/gi, "_").toLowerCase(),
        title: `Evaluate shifting ${route.origin} to ${route.destination} from ${route.mode} to ${profile.targetMode}`,
        category: "mode_shift",
        priority: route.mode === "AIR" ? "high" : "medium",
        estimatedTco2eSavings: round(route.totalEmissions * profile.shiftShare * profile.reductionRate),
        estimatedCostImpact: hasCost ? round((route.totalCost * profile.shiftShare * profile.costMultiplier) - (route.totalCost * profile.shiftShare)) : null,
        confidenceScore: route.shipmentCount >= 2 ? 0.7 : 0.58,
        effortLevel: "high",
        implementationTimeframe: "60-120 days",
        affectedRecordsCount: route.shipmentCount,
        affectedShipments: route.shipments.slice(0, 20).map((shipment) => getId(shipment)),
        explanation: `This lane averages ${Math.round(route.averageDistanceKm)} km and currently uses ${route.mode}. A partial mode shift is only recommended because distance and emissions data exist for real shipments.`,
        assumptions: [`Only ${Math.round(profile.shiftShare * 100)}% of comparable volume is assumed shiftable.`, "Lead-time and service-level feasibility must be confirmed before implementation.", hasCost ? "Cost impact uses recorded shipment costs and mode-shift benchmark multipliers." : SAVINGS_UNAVAILABLE],
        requiredData: ["shipment distance", "weight", "mode", "emissions", "cost", "delivery time constraints"],
        nextActions: ["Identify shipments with flexible lead times.", "Request alternate mode quotes.", "Pilot the shift before changing customer commitments."],
        dataUsed: [`${route.shipmentCount} shipments`, `${round(route.totalEmissions)} tCO2e`, `${Math.round(route.averageDistanceKm)} average km`],
        calculationBasis: `estimated savings = lane emissions x ${Math.round(profile.shiftShare * 100)}% shiftable volume x ${Math.round(profile.reductionRate * 100)}% mode reduction assumption`,
      }));
    }

    return recommendations;
  });
}

function analyzeCarriers(routes) {
  const allCarrierStats = routes.flatMap((route) => route.carrierStats.map((stats) => ({
    ...stats,
    mode: route.mode,
    route,
    emissionIntensity: stats.tonKm > 0 ? stats.emissions / stats.tonKm : null,
    costIntensity: stats.tonKm > 0 ? stats.cost / stats.tonKm : null,
  })));

  return routes.flatMap((route) => {
    if (route.carrierStats.length === 0) return [];
    const primary = route.carrierStats.sort((left, right) => right.emissions - left.emissions)[0];
    if (!primary || primary.tonKm <= 0) return [];

    const currentIntensity = primary.emissions / primary.tonKm;
    const alternatives = allCarrierStats
      .filter((carrier) => carrier.mode === route.mode && carrier.carrier !== primary.carrier && carrier.emissionIntensity !== null)
      .filter((carrier) => carrier.emissionIntensity < currentIntensity)
      .sort((left, right) => left.emissionIntensity - right.emissionIntensity);

    const best = alternatives[0];
    if (!best) return [];

    const costKnown = primary.cost > 0 && Number.isFinite(best.costIntensity) && best.costIntensity > 0;
    return [makeRecommendation({
      recommendationId: `carrier_${primary.carrier}_${best.carrier}_${route.mode}`.replace(/[^a-z0-9]+/gi, "_").toLowerCase(),
      title: `Benchmark ${primary.carrier} against lower-emission ${route.mode} carriers`,
      category: "carrier",
      priority: "medium",
      estimatedTco2eSavings: round(Math.max(0, (currentIntensity - best.emissionIntensity) * primary.tonKm)),
      estimatedCostImpact: costKnown ? round((best.costIntensity * primary.tonKm) - primary.cost) : null,
      confidenceScore: best.count >= 2 ? 0.72 : 0.56,
      effortLevel: "medium",
      implementationTimeframe: "30-90 days",
      affectedRecordsCount: primary.count,
      affectedShipments: route.shipments.filter((shipment) => shipment.carrier === primary.carrier).slice(0, 20).map((shipment) => getId(shipment)),
      explanation: `${best.carrier} has lower observed emissions intensity than ${primary.carrier} on ${route.mode} shipments in this company's data.`,
      assumptions: ["Carrier switch is recommended only because an alternative carrier exists in company shipment history.", costKnown ? "Cost impact compares observed cost per tonne-km." : SAVINGS_UNAVAILABLE],
      requiredData: ["carrier", "transport mode", "distance", "weight", "emissions", "shipment cost"],
      nextActions: ["Validate service constraints.", "Request updated carrier quotes.", "Create a carrier scorecard using emissions per tonne-km."],
      dataUsed: [`${primary.count} affected shipments`, `${best.count} benchmark shipments`, `${round(primary.tonKm)} affected tonne-km`],
      calculationBasis: "estimated savings = affected tonne-km x observed emissions-intensity gap",
    })];
  });
}

function analyzeSuppliers(shipments, suppliers) {
  const shipmentsBySupplier = new Map();
  shipments.forEach((shipment) => {
    const supplierId = String(shipment.supplierId || "");
    if (!supplierId) return;
    const current = shipmentsBySupplier.get(supplierId) || { count: 0, emissions: 0, cost: 0, shipmentIds: [] };
    current.count += 1;
    current.emissions += getShipmentEmissions(shipment);
    current.cost += getShipmentCost(shipment);
    current.shipmentIds.push(getId(shipment));
    shipmentsBySupplier.set(supplierId, current);
  });

  return suppliers.flatMap((supplier) => {
    const supplierId = getId(supplier);
    const stats = shipmentsBySupplier.get(supplierId) || { count: 0, emissions: 0, cost: 0, shipmentIds: [] };
    const totalSupplierEmissions = Number(supplier.totalEmissionsTco2e || supplier.totalEmissions || 0);
    const highRisk = ["HIGH", "CRITICAL"].includes(String(supplier.riskLevel || "").toUpperCase()) || Number(supplier.riskScore || 0) >= 70;
    const missingData = Number(supplier.dataTransparencyScore || 0) <= 0 || !supplier.lastReportedAt || totalSupplierEmissions <= 0;

    if (!highRisk && !missingData && totalSupplierEmissions <= 0) return [];

    return [makeRecommendation({
      recommendationId: `supplier_${supplierId}`.replace(/[^a-z0-9]+/gi, "_").toLowerCase(),
      title: missingData ? `Close supplier emissions data gaps for ${supplier.name}` : `Review high-risk supplier exposure for ${supplier.name}`,
      category: "supplier",
      priority: highRisk ? "high" : "medium",
      estimatedTco2eSavings: null,
      estimatedCostImpact: null,
      confidenceScore: missingData ? 0.62 : 0.68,
      effortLevel: "medium",
      implementationTimeframe: "30-90 days",
      affectedRecordsCount: stats.count || 1,
      affectedShipments: stats.shipmentIds.slice(0, 20),
      affectedSuppliers: [supplierId],
      explanation: missingData
        ? `${supplier.name} has incomplete supplier emissions, ESG, or reporting data. Optimization should begin with factor replacement or supplier engagement before savings are claimed.`
        : `${supplier.name} has elevated supplier risk and is connected to ${stats.count} shipments in this company's data.`,
      assumptions: [SAVINGS_UNAVAILABLE, "Supplier changes require procurement review and validated replacement factors."],
      requiredData: ["supplier risk", "supplier emissions", "supplier category", "country", "questionnaire status"],
      nextActions: ["Send or update supplier questionnaire.", "Request primary emissions factors.", "Flag supplier for sourcing review if data remains incomplete."],
      dataUsed: [`${stats.count} linked shipments`, `risk level ${supplier.riskLevel || "unknown"}`, `country ${supplier.country || "unknown"}`],
      calculationBasis: SAVINGS_UNAVAILABLE,
    })];
  });
}

function analyzeCarbonLedger(emissionRecords) {
  const sampleRecords = emissionRecords.filter((record) => record.factorIsSample);
  const zeroRecords = emissionRecords.filter((record) => Number(record.amountTonnes || record.emissionsTCo2e || 0) <= 0);
  const unapprovedRecords = emissionRecords.filter((record) => record.dataStatus !== "approved");
  const recommendations = [];

  if (sampleRecords.length) {
    recommendations.push(makeRecommendation({
      recommendationId: "ledger_replace_sample_factors",
      title: "Replace sample emission factors before official reporting",
      category: "data_quality",
      priority: "high",
      estimatedTco2eSavings: null,
      estimatedCostImpact: null,
      confidenceScore: 0.9,
      effortLevel: "medium",
      implementationTimeframe: "14-30 days",
      affectedRecordsCount: sampleRecords.length,
      explanation: `${sampleRecords.length} real emission records use sample factors. These records should not drive official reporting or optimization savings until replaced with approved factors.`,
      assumptions: [SAVINGS_UNAVAILABLE],
      requiredData: ["official emission factor", "factor source", "factor year", "approval status"],
      nextActions: ["Open carbon ledger factor review.", "Replace sample factors.", "Recalculate affected records."],
      dataUsed: [`${sampleRecords.length} sample-factor records`],
      calculationBasis: SAVINGS_UNAVAILABLE,
    }));
  }

  if (zeroRecords.length || unapprovedRecords.length) {
    recommendations.push(makeRecommendation({
      recommendationId: "ledger_fix_zero_unapproved_records",
      title: "Resolve zero-value and unapproved carbon ledger records",
      category: "data_quality",
      priority: unapprovedRecords.length ? "high" : "medium",
      estimatedTco2eSavings: null,
      estimatedCostImpact: null,
      confidenceScore: 0.88,
      effortLevel: "low",
      implementationTimeframe: "7-21 days",
      affectedRecordsCount: zeroRecords.length + unapprovedRecords.length,
      explanation: `${zeroRecords.length} records have zero activity or emissions and ${unapprovedRecords.length} records are not approved. Data quality must be fixed before optimization is considered audit-grade.`,
      assumptions: [SAVINGS_UNAVAILABLE],
      requiredData: ["activity amount", "emissions amount", "approval status"],
      nextActions: ["Review zero-value records.", "Submit or approve validated records.", "Exclude unresolved drafts from external reporting."],
      dataUsed: [`${zeroRecords.length} zero records`, `${unapprovedRecords.length} unapproved records`],
      calculationBasis: SAVINGS_UNAVAILABLE,
    }));
  }

  return recommendations;
}

function analyzeFinancialExposure({ shipments, ledgerEntries }) {
  const carbonCost = shipments.reduce((sum, shipment) => sum + Number(shipment.carbonCostUsd || 0), 0)
    + ledgerEntries.reduce((sum, entry) => sum + Number(entry.carbonCostUsd || entry.carbonTaxUsd || 0), 0);
  const emissions = shipments.reduce((sum, shipment) => sum + getShipmentEmissions(shipment), 0)
    + ledgerEntries.reduce((sum, entry) => sum + Number(entry.emissionsTonnes || 0), 0);

  if (carbonCost <= 0 || emissions <= 0) return [];

  return [makeRecommendation({
    recommendationId: "financial_carbon_cost_exposure",
    title: "Prioritize lanes with measurable carbon cost exposure",
    category: "financial",
    priority: carbonCost >= 25000 ? "high" : "medium",
    estimatedTco2eSavings: null,
    estimatedCostImpact: null,
    confidenceScore: 0.74,
    effortLevel: "medium",
    implementationTimeframe: "30-60 days",
    affectedRecordsCount: shipments.length + ledgerEntries.length,
    affectedShipments: shipments.slice(0, 20).map((shipment) => getId(shipment)),
    explanation: `Recorded carbon cost and tax exposure totals ${round(carbonCost, 0)} USD across ${round(emissions)} tCO2e. Use this exposure to prioritize high-emissions actions with finance.`,
    assumptions: [SAVINGS_UNAVAILABLE, "Financial impact depends on future internal carbon price, taxes, and procurement execution."],
    requiredData: ["shipment carbon cost", "ledger carbon tax", "internal carbon price", "emissions"],
    nextActions: ["Align with finance on internal carbon price.", "Rank recommendations by carbon cost exposure.", "Track avoided carbon cost after implementation."],
    dataUsed: [`${shipments.length} shipments`, `${ledgerEntries.length} ledger entries`, `${round(carbonCost, 0)} USD carbon exposure`],
    calculationBasis: "carbon exposure = recorded shipment carbon costs + ledger carbon costs/taxes",
  })];
}

function computeSummary({ shipments, suppliers, routes, emissionRecords, ledgerEntries, recommendations, dateRange }) {
  const totalEmissions = round(
    shipments.reduce((sum, shipment) => sum + getShipmentEmissions(shipment), 0)
      + emissionRecords.reduce((sum, record) => sum + Number(record.emissionsTCo2e || record.amountTonnes || 0), 0),
  );
  const totalCost = round(
    shipments.reduce((sum, shipment) => sum + getShipmentCost(shipment), 0)
      + ledgerEntries.reduce((sum, entry) => sum + Number(entry.totalCostUsd || entry.logisticsCostUsd || entry.carbonCostUsd || 0), 0),
  );
  const completeShipments = shipments.filter((shipment) => {
    return Number(shipment.distanceKm || 0) > 0
      && Number(shipment.weightKg || 0) > 0
      && getShipmentEmissions(shipment) > 0
      && Number(shipment.costUsd || 0) > 0;
  }).length;
  const dataCompleteness = shipments.length ? round((completeShipments / shipments.length) * 100) : 0;

  return {
    totalShipmentsAnalyzed: shipments.length,
    shipmentsAnalyzed: shipments.length,
    totalEmissionsAnalyzed: totalEmissions,
    totalCostAnalyzed: totalCost,
    routesAnalyzed: routes.length,
    carriersAnalyzed: new Set(shipments.map((shipment) => shipment.carrier).filter(Boolean)).size,
    suppliersAnalyzed: suppliers.length,
    ledgerRecordsAnalyzed: emissionRecords.length,
    financialLedgerEntriesAnalyzed: ledgerEntries.length,
    dateRange: dateRange || null,
    dataCompleteness,
    missingDataIssues: [],
    analysisMode: getOptimizationAiConfig().mode,
    generatedAt: new Date().toISOString(),
    potentialTco2eSavings: round(recommendations.reduce((sum, recommendation) => sum + Number(recommendation.estimatedTco2eSavings || 0), 0)),
    potentialCostImpact: recommendations.reduce((sum, recommendation) => {
      if (recommendation.estimatedCostImpact === null || recommendation.estimatedCostImpact === undefined) return sum;
      return sum + Number(recommendation.estimatedCostImpact || 0);
    }, 0),
  };
}

function buildAnswerSummary({ recommendations, dataQualityIssues, shipments }) {
  if (!shipments.length) {
    return "No shipment data is available for the selected scope. Add shipments with distance, weight, mode, carrier, cost, and calculated emissions before running optimization.";
  }
  if (!recommendations.length) {
    return "CarbonFlow analyzed real company data but did not find a confident optimization opportunity for this question. Review missing data warnings or narrow the filter.";
  }
  if (dataQualityIssues.some((issue) => issue.code === "missing_shipment_cost")) {
    return "Recommendations are based on real emissions and shipment data. Cost-carbon tradeoffs are limited because some shipment cost data is missing.";
  }
  return `CarbonFlow found ${recommendations.length} data-backed optimization recommendations using real company shipments, suppliers, carbon ledger, and financial ledger records.`;
}

class OptimizationService {
  static async loadContext(companyId, options = {}) {
    if (!companyId) throw new ApiError(400, "Company context is required");

    const [shipments, suppliers, emissionRecords, ledgerEntries] = await Promise.all([
      Shipment.find(shipmentFilter(companyId, options))
        .select("supplierId reference origin destination distanceKm transportMode carrier weightKg costUsd emissionsTonnes emissionsKgCo2e status shipmentDate carbonCostUsd calculationStatus factorSource")
        .lean(),
      Supplier.find(supplierFilter(companyId, options))
        .select("name country region category riskLevel riskScore carbonScore esgScore dataTransparencyScore totalEmissions totalEmissionsTco2e lastReportedAt questionnaireStatus renewableRatio emissionIntensity")
        .lean(),
      EmissionRecord.find({ companyId, ...dateFilter("occurredAt", options.dateRange) })
        .select("scope category sourceType shipmentId supplierId amountTonnes emissionsTCo2e dataStatus factorIsSample factorIsOfficial factorSourceName factorSourceYear occurredAt costUsd activityAmount")
        .lean(),
      LedgerEntry.find({ companyId })
        .select("shipmentId supplierId entryDate category logisticsCostUsd internalCarbonPriceUsd emissionsTonnes carbonTaxUsd carbonCostUsd totalCostUsd")
        .lean(),
    ]);

    const routes = buildRouteGroups(shipments);
    const dataQualityIssues = buildDataQualityIssues({ shipments, suppliers, emissionRecords, ledgerEntries });
    const recommendations = OptimizationService.generateRecommendations({ shipments, suppliers, routes, emissionRecords, ledgerEntries });
    const summary = computeSummary({ shipments, suppliers, routes, emissionRecords, ledgerEntries, recommendations, dateRange: options.dateRange });
    summary.missingDataIssues = dataQualityIssues;

    return {
      analysisMode: getOptimizationAiConfig().mode,
      generatedAt: summary.generatedAt,
      recommendations,
      summary,
      analysisCoverage: summary,
      dataQualityIssues,
      assumptions: ["Rule-based optimization uses company-scoped records only.", "Savings are omitted when required data is missing."],
    };
  }

  static generateRecommendations(context) {
    const recommendations = [
      ...analyzeRoutes(context.routes),
      ...analyzeCarriers(context.routes),
      ...analyzeSuppliers(context.shipments, context.suppliers),
      ...analyzeCarbonLedger(context.emissionRecords),
      ...analyzeFinancialExposure(context),
    ];

    return recommendations
      .sort((left, right) => {
        const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
        return (priorityWeight[right.priority] || 0) - (priorityWeight[left.priority] || 0)
          || Number(right.estimatedTco2eSavings || 0) - Number(left.estimatedTco2eSavings || 0);
      })
      .slice(0, MAX_RECOMMENDATIONS);
  }

  static async getContext(companyId, options = {}) {
    const context = await OptimizationService.loadContext(companyId, options);
    return {
      ...context.summary,
      dataQualityIssues: context.dataQualityIssues,
      assumptions: context.assumptions,
    };
  }

  static async analyze({ question, query, dateRange, filters } = {}, user = {}, requestMeta = {}) {
    const normalizedQuestion = normalizeQuery(question || query);
    if (!normalizedQuestion) throw new ApiError(400, "Question is required");
    const companyId = user.companyId;
    const context = await OptimizationService.loadContext(companyId, { dateRange, filters });
    let recommendations = context.summary.totalShipmentsAnalyzed ? context.recommendations : [];

    if (!recommendations.length && context.summary.totalShipmentsAnalyzed) {
      recommendations = context.summary.missingDataIssues.some((issue) => issue.severity === "high")
        ? context.summary.missingDataIssues.map((issue) => makeRecommendation({
          recommendationId: `quality_${issue.code}`,
          title: issue.message,
          category: "data_quality",
          priority: issue.severity === "high" ? "high" : "medium",
          estimatedTco2eSavings: null,
          estimatedCostImpact: null,
          confidenceScore: 0.82,
          effortLevel: "low",
          implementationTimeframe: "7-30 days",
          affectedRecordsCount: 0,
          explanation: "The selected data can be analyzed, but data quality must improve before CarbonFlow can produce a defensible savings estimate.",
          assumptions: [SAVINGS_UNAVAILABLE],
          requiredData: ["complete activity data", "approved factor data"],
          nextActions: ["Fix the listed data issue.", "Re-run optimization after recalculation."],
        }))
        : [];
    }

    context.summary.potentialTco2eSavings = round(recommendations.reduce((sum, recommendation) => sum + Number(recommendation.estimatedTco2eSavings || 0), 0));
    context.summary.potentialCostImpact = round(recommendations.reduce((sum, recommendation) => {
      if (recommendation.estimatedCostImpact === null || recommendation.estimatedCostImpact === undefined) return sum;
      return sum + Number(recommendation.estimatedCostImpact || 0);
    }, 0));

    const answerSummary = buildAnswerSummary({
      recommendations,
      dataQualityIssues: context.dataQualityIssues,
      shipments: { length: context.summary.totalShipmentsAnalyzed },
    });

    const run = await OptimizationRun.create({
      companyId,
      question: normalizedQuestion,
      analysisMode: getOptimizationAiConfig().mode,
      filters: { dateRange: dateRange || null, ...(filters || {}) },
      recommendations,
      dataCoverage: context.summary,
      dataQualityIssues: context.dataQualityIssues,
      createdBy: user.id || user._id || null,
    });

    const persistedRecommendations = recommendations.length
      ? await OptimizationRecommendation.insertMany(recommendations.map((recommendation) => ({
        ...recommendation,
        runId: getId(run),
        companyId,
        createdBy: user.id || user._id || null,
      })))
      : [];

    await AuditService.log({
      companyId,
      userId: user.id || user._id || null,
      userEmail: user.email || null,
      action: "optimization_analysis_run",
      entityType: "OptimizationRun",
      entityId: getId(run),
      ipAddress: requestMeta.ipAddress || null,
      userAgent: requestMeta.userAgent || null,
      details: {
        question: normalizedQuestion,
        filters: { dateRange: dateRange || null, ...(filters || {}) },
        recommendationCount: recommendations.length,
        analysisMode: getOptimizationAiConfig().mode,
      },
    });

    return {
      runId: getId(run),
      question: normalizedQuestion,
      query: normalizedQuestion,
      answerSummary,
      recommendations: persistedRecommendations.map((recommendation) => recommendation.toObject ? recommendation.toObject() : recommendation),
      analysisCoverage: context.summary,
      summary: context.summary,
      dataQualityIssues: context.dataQualityIssues,
      assumptions: context.assumptions,
      analysisMode: getOptimizationAiConfig().mode,
      generatedAt: context.generatedAt,
    };
  }

  static async listRuns(companyId) {
    const runs = await OptimizationRun.find({ companyId }).sort({ createdAt: -1 }).limit(50).lean();
    return runs.map((run) => {
      const recommendations = Array.isArray(run.recommendations) ? run.recommendations : [];
      const statusSummary = recommendations.reduce((summary, recommendation) => {
        const status = recommendation.status || "suggested";
        summary[status] = (summary[status] || 0) + 1;
        return summary;
      }, {});

      return {
        ...run,
        recommendationCount: recommendations.length,
        statusSummary,
      };
    });
  }

  static async getRun(companyId, runId) {
    const run = await OptimizationRun.findOne({ _id: runId, companyId }).lean();
    if (!run) throw new ApiError(404, "Optimization run not found");
    const recommendations = await OptimizationRecommendation.find({ runId, companyId }).sort({ createdAt: -1 }).lean();
    return { ...run, recommendations };
  }

  static buildCsvExport({ run, recommendations }) {
    const rows = [
      ["recommendationId", "category", "priority", "title", "estimatedTco2eSavings", "estimatedCostImpact", "confidenceScore", "effortLevel", "timeframe", "affectedRecordsCount", "status", "assumptions", "requiredData", "nextActions"],
      ...recommendations.map((recommendation) => [
        recommendation.recommendationId,
        recommendation.category,
        recommendation.priority,
        recommendation.title,
        recommendation.estimatedTco2eSavings ?? "Not enough data",
        recommendation.estimatedCostImpact ?? "Not enough data",
        recommendation.confidenceScore,
        recommendation.effortLevel,
        recommendation.implementationTimeframe,
        recommendation.affectedRecordsCount,
        recommendation.status || "suggested",
        (recommendation.assumptions || []).join(" | "),
        (recommendation.requiredData || []).join(" | "),
        (recommendation.nextActions || []).join(" | "),
      ]),
    ];

    const header = [
      ["Optimization Run", run._id || run.id],
      ["Question", run.question],
      ["Analysis Mode", run.analysisMode],
      ["Generated At", run.createdAt ? new Date(run.createdAt).toISOString() : new Date().toISOString()],
      [],
    ];

    return [...header, ...rows]
      .map((row) => row.map((value) => `"${sanitizeCsvCell(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");
  }

  static buildPdfExport({ run, recommendations, company, generatedBy }) {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ margin: 48 });
      const chunks = [];
      const coverage = run.dataCoverage || {};
      const issues = run.dataQualityIssues || [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      doc.fontSize(20).text("CarbonFlow Optimization Report");
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor("#4b5563").text(`Company: ${company?.name || run.companyId}`);
      doc.text(`Generated by: ${generatedBy?.email || generatedBy?.name || generatedBy?.id || "Unknown user"}`);
      doc.text(`Generated at: ${new Date().toISOString()}`);
      doc.text(`Analysis mode: ${run.analysisMode}`);
      doc.text(`Question: ${run.question}`);
      doc.text(`Filters: ${JSON.stringify(run.filters || {})}`);
      doc.moveDown();

      doc.fillColor("#111827").fontSize(14).text("Data Coverage");
      doc.fontSize(10);
      doc.text(`Shipments analyzed: ${coverage.totalShipmentsAnalyzed || 0}`);
      doc.text(`Suppliers analyzed: ${coverage.suppliersAnalyzed || 0}`);
      doc.text(`Carbon ledger records analyzed: ${coverage.ledgerRecordsAnalyzed || 0}`);
      doc.text(`Financial entries analyzed: ${coverage.financialLedgerEntriesAnalyzed || 0}`);
      doc.text(`Data completeness: ${coverage.dataCompleteness || 0}%`);
      doc.moveDown();

      doc.fontSize(14).text("Top Recommendations");
      doc.fontSize(9);
      if (!recommendations.length) {
        doc.text("No recommendations were generated for this run.");
      }
      recommendations.forEach((recommendation, index) => {
        doc.moveDown(0.5);
        doc.fontSize(11).text(`${index + 1}. ${recommendation.title}`);
        doc.fontSize(9);
        doc.text(`Priority: ${recommendation.priority} | Category: ${recommendation.category} | Status: ${recommendation.status || "suggested"}`);
        doc.text(`Estimated tCO2e savings: ${recommendation.estimatedTco2eSavings ?? "Not enough data"}`);
        doc.text(`Estimated cost impact: ${recommendation.estimatedCostImpact ?? "Not enough data"}`);
        doc.text(`Confidence: ${Math.round(Number(recommendation.confidenceScore || 0) * 100)}% | Effort: ${recommendation.effortLevel} | Timeframe: ${recommendation.implementationTimeframe}`);
        doc.text(`Affected records: ${recommendation.affectedRecordsCount || 0}`);
        doc.text(`Affected shipments: ${(recommendation.affectedShipments || []).join(", ") || "None listed"}`);
        doc.text(`Affected suppliers: ${(recommendation.affectedSuppliers || []).join(", ") || "None listed"}`);
        doc.text(`Explanation: ${recommendation.explanation}`);
        doc.text(`Calculation basis: ${recommendation.calculationBasis || SAVINGS_UNAVAILABLE}`);
        doc.text(`Assumptions: ${(recommendation.assumptions || []).join(" | ") || "None listed"}`);
        doc.text(`Required data: ${(recommendation.requiredData || []).join(" | ") || "None listed"}`);
        doc.text(`Next actions: ${(recommendation.nextActions || []).join(" | ") || "None listed"}`);
      });

      doc.moveDown();
      doc.fontSize(14).text("Data Quality Warnings");
      doc.fontSize(10);
      if (!issues.length) doc.text("No data quality warnings were recorded for this run.");
      issues.forEach((issue) => doc.text(`${issue.severity || "warning"}: ${issue.message}`));
      doc.moveDown();

      doc.fontSize(14).text("Limitations and Disclaimer");
      doc.fontSize(10);
      doc.text("Recommendations are decision-support outputs, not automatic operational changes.");
      doc.text("Savings are omitted when required data is missing. Operational feasibility, procurement constraints, customer commitments, and assurance requirements must be reviewed before implementation.");
      doc.text("This report is generated from company-scoped CarbonFlow records and does not use an external AI provider.");

      doc.end();
    });
  }

  static async buildExport(companyId, runId, format, user = {}, requestMeta = {}) {
    const normalizedFormat = String(format || "").toUpperCase();
    if (!["PDF", "CSV"].includes(normalizedFormat)) throw new ApiError(400, "Export format must be PDF or CSV");

    const run = await OptimizationRun.findOne({ _id: runId, companyId }).lean();
    if (!run) throw new ApiError(404, "Optimization run not found");
    const [recommendations, company] = await Promise.all([
      OptimizationRecommendation.find({ runId, companyId }).sort({ priority: 1, createdAt: -1 }).lean(),
      Company.findById(companyId).lean().catch(() => null),
    ]);

    const fileBaseName = `optimization-${runId}-${normalizedFormat.toLowerCase()}`;
    const content = normalizedFormat === "CSV"
      ? OptimizationService.buildCsvExport({ run, recommendations })
      : await OptimizationService.buildPdfExport({ run, recommendations, company, generatedBy: user });

    await AuditService.log({
      companyId,
      userId: user.id || user._id || null,
      userEmail: user.email || null,
      action: "optimization_report_generated",
      entityType: "OptimizationRun",
      entityId: runId,
      ipAddress: requestMeta.ipAddress || null,
      userAgent: requestMeta.userAgent || null,
      details: {
        format: normalizedFormat,
        recommendationCount: recommendations.length,
      },
    });

    return {
      fileName: `${fileBaseName}.${normalizedFormat.toLowerCase()}`,
      contentType: normalizedFormat === "CSV" ? "text/csv; charset=utf-8" : "application/pdf",
      content,
    };
  }

  static async updateRecommendationStatus(companyId, recommendationId, status, user = {}, requestMeta = {}) {
    const allowedStatuses = ["suggested", "planned", "in_progress", "implemented", "dismissed"];
    if (!allowedStatuses.includes(status)) throw new ApiError(400, "Invalid recommendation status");

    const recommendation = await OptimizationRecommendation.findOne({ _id: recommendationId, companyId });
    if (!recommendation) throw new ApiError(404, "Recommendation not found");
    const oldStatus = recommendation.status;
    recommendation.status = status;
    recommendation.updatedBy = user.id || user._id || null;
    await recommendation.save();

    await AuditService.log({
      companyId,
      userId: user.id || user._id || null,
      userEmail: user.email || null,
      action: status === "dismissed" ? "optimization_recommendation_dismissed" : "optimization_recommendation_status_changed",
      entityType: "OptimizationRecommendation",
      entityId: getId(recommendation),
      ipAddress: requestMeta.ipAddress || null,
      userAgent: requestMeta.userAgent || null,
      oldValue: { status: oldStatus },
      newValue: { status },
    });

    return recommendation.toObject();
  }
}

OptimizationService.SAVINGS_UNAVAILABLE = SAVINGS_UNAVAILABLE;
OptimizationService.normalizeQuery = normalizeQuery;
OptimizationService.buildRouteGroups = buildRouteGroups;
OptimizationService.analyzeRoutes = analyzeRoutes;
OptimizationService.analyzeCarriers = analyzeCarriers;
OptimizationService.analyzeSuppliers = analyzeSuppliers;
OptimizationService.analyzeCarbonLedger = analyzeCarbonLedger;
OptimizationService.analyzeFinancialExposure = analyzeFinancialExposure;

module.exports = OptimizationService;
