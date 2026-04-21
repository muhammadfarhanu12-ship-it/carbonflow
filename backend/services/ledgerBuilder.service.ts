const { Shipment, Supplier, User } = require("../models");
const ApiError = require("../utils/ApiError");
const { calculateShipmentEmissions, round } = require("./carbonEngine");
const EmissionRecordService = require("./emissionRecord.service");
const SettingsService = require("./settings.service");
const SupplierService = require("./supplier.service");
const UserContextService = require("./userContext.service");

const MAX_GLOBAL_SHIPMENTS = 180;
const MAX_GLOBAL_SUPPLIERS = 40;
const MAX_CONTEXT_SHIPMENTS = 40;
const MAX_CONTEXT_SUPPLIERS = 12;

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function isPositiveNumber(value) {
  return isFiniteNumber(value) && Number(value) > 0;
}

function isNonEmptyString(value) {
  return String(value || "").trim().length > 0;
}

function normalizeId(value) {
  return String(value || "").trim();
}

function dedupeById(records) {
  const seen = new Set();

  return records.filter((record) => {
    const recordId = normalizeId(record?.id);

    if (!recordId || seen.has(recordId)) {
      return false;
    }

    seen.add(recordId);
    return true;
  });
}

function sortByEmissionsDesc(records) {
  return [...records].sort((left, right) => Number(right.emissions || 0) - Number(left.emissions || 0));
}

function sortSuppliersByImpact(records) {
  return [...records].sort((left, right) => {
    if (Number(right.totalEmissions || 0) !== Number(left.totalEmissions || 0)) {
      return Number(right.totalEmissions || 0) - Number(left.totalEmissions || 0);
    }

    return Number(left.sustainabilityScore || 0) - Number(right.sustainabilityScore || 0);
  });
}

function withinDistanceWindow(candidateDistanceKm, targetDistanceKm) {
  if (!isPositiveNumber(candidateDistanceKm) || !isPositiveNumber(targetDistanceKm)) {
    return false;
  }

  return Math.abs(Number(candidateDistanceKm) - Number(targetDistanceKm)) <= Number(targetDistanceKm) * 0.25;
}

async function resolveUser(userId) {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return UserContextService.ensureCompanyContext(user);
}

function normalizeShipmentRecord(shipment, emissionFactorOverrides = {}) {
  const shipmentId = normalizeId(shipment.id || shipment._id);
  const origin = String(shipment.origin || "").trim();
  const destination = String(shipment.destination || "").trim();
  const transportMode = String(shipment.transportMode || "").trim().toUpperCase();
  const distanceKm = Number(shipment.distanceKm || 0);
  const weightKg = Number(shipment.weightKg || 0);

  if (!shipmentId || !origin || !destination || !transportMode || !isPositiveNumber(distanceKm) || !isPositiveNumber(weightKg)) {
    return null;
  }

  const computed = calculateShipmentEmissions(shipment, emissionFactorOverrides);
  const emissions = isPositiveNumber(shipment.emissionsTonnes)
    ? round(shipment.emissionsTonnes, 4)
    : round(computed.emissionsTonnes, 4);

  if (!isPositiveNumber(emissions)) {
    return null;
  }

  return {
    id: shipmentId,
    supplierId: normalizeId(shipment.supplierId),
    origin,
    destination,
    distanceKm: round(distanceKm, 2),
    weightKg: round(weightKg, 2),
    transportMode: computed.transportMode || transportMode,
    emissions,
  };
}

function buildSupplierShipmentTotals(shipments) {
  return shipments.reduce((totals, shipment) => {
    if (!shipment.supplierId) {
      return totals;
    }

    totals.set(
      shipment.supplierId,
      round(Number(totals.get(shipment.supplierId) || 0) + Number(shipment.emissions || 0), 4),
    );

    return totals;
  }, new Map());
}

function normalizeSupplierRecord(supplier, shipmentTotalsBySupplierId) {
  const supplierView = SupplierService.toSupplierView(supplier);
  const supplierId = normalizeId(supplierView.id || supplierView._id);
  const totalEmissions = isPositiveNumber(supplierView.totalEmissions)
    ? round(supplierView.totalEmissions, 4)
    : round(Number(shipmentTotalsBySupplierId.get(supplierId) || 0), 4);
  const emissionIntensity = isPositiveNumber(supplierView.emissionIntensity)
    ? round(supplierView.emissionIntensity, 4)
    : isPositiveNumber(supplierView.emissionFactor)
      ? round(supplierView.emissionFactor, 4)
      : 0;
  const sustainabilityScore = isFiniteNumber(supplierView.esgScore)
    ? round(supplierView.esgScore, 2)
    : isFiniteNumber(supplierView.carbonScore)
      ? round(supplierView.carbonScore, 2)
      : 0;

  if (!supplierId || !isNonEmptyString(supplierView.name) || !isPositiveNumber(totalEmissions) || !isPositiveNumber(emissionIntensity)) {
    return null;
  }

  return {
    id: supplierId,
    name: supplierView.name,
    region: String(supplierView.region || "").trim(),
    category: String(supplierView.category || "").trim(),
    totalEmissions,
    emissionIntensity,
    sustainabilityScore,
  };
}

function pickGlobalShipments(shipments) {
  return sortByEmissionsDesc(shipments).slice(0, MAX_GLOBAL_SHIPMENTS);
}

function pickGlobalSuppliers(suppliers) {
  return sortSuppliersByImpact(suppliers).slice(0, MAX_GLOBAL_SUPPLIERS);
}

function pickShipmentContextShipments(shipments, shipmentId) {
  const targetShipment = shipments.find((shipment) => shipment.id === shipmentId);

  if (!targetShipment) {
    throw new ApiError(404, "Shipment not found");
  }

  const sameLane = shipments.filter((shipment) => (
    shipment.origin === targetShipment.origin
    && shipment.destination === targetShipment.destination
  ));
  const similarDistance = shipments.filter((shipment) => withinDistanceWindow(shipment.distanceKm, targetShipment.distanceKm));

  return dedupeById([
    targetShipment,
    ...sortByEmissionsDesc(sameLane),
    ...sortByEmissionsDesc(similarDistance),
  ]).slice(0, MAX_CONTEXT_SHIPMENTS);
}

function pickShipmentContextSuppliers(suppliers, shipments, shipmentId) {
  const targetShipment = shipments.find((shipment) => shipment.id === shipmentId);

  if (!targetShipment || !targetShipment.supplierId) {
    return [];
  }

  const targetSupplier = suppliers.find((supplier) => supplier.id === targetShipment.supplierId);

  if (!targetSupplier) {
    return [];
  }

  const comparables = suppliers.filter((supplier) => (
    supplier.id !== targetSupplier.id
    && (
      (targetSupplier.category && supplier.category === targetSupplier.category)
      || (targetSupplier.region && supplier.region === targetSupplier.region)
    )
  ));

  return dedupeById([
    targetSupplier,
    ...sortSuppliersByImpact(comparables),
  ]).slice(0, MAX_CONTEXT_SUPPLIERS);
}

function pickSupplierContextShipments(shipments, supplierId) {
  return sortByEmissionsDesc(
    shipments.filter((shipment) => shipment.supplierId === supplierId),
  ).slice(0, MAX_CONTEXT_SHIPMENTS);
}

function pickSupplierContextSuppliers(suppliers, supplierId) {
  const targetSupplier = suppliers.find((supplier) => supplier.id === supplierId);

  if (!targetSupplier) {
    throw new ApiError(404, "Supplier not found");
  }

  const comparables = suppliers.filter((supplier) => (
    supplier.id !== targetSupplier.id
    && (
      (targetSupplier.category && supplier.category === targetSupplier.category)
      || (targetSupplier.region && supplier.region === targetSupplier.region)
    )
  ));

  return dedupeById([
    targetSupplier,
    ...sortSuppliersByImpact(comparables),
  ]).slice(0, MAX_CONTEXT_SUPPLIERS);
}

function stripShipmentForLedger(shipment) {
  return {
    origin: shipment.origin,
    destination: shipment.destination,
    distanceKm: shipment.distanceKm,
    weightKg: shipment.weightKg,
    transportMode: shipment.transportMode,
    emissions: shipment.emissions,
  };
}

function stripSupplierForLedger(supplier) {
  return {
    name: supplier.name,
    totalEmissions: supplier.totalEmissions,
    emissionIntensity: supplier.emissionIntensity,
    sustainabilityScore: supplier.sustainabilityScore,
  };
}

async function buildCarbonLedger(userId, options = {}) {
  const user = await resolveUser(userId);
  const companyId = normalizeId(user.companyId);
  const settings = await SettingsService.getByCompanyId(companyId);
  const [shipments, suppliers, companySummary] = await Promise.all([
    Shipment.find({ companyId }).lean(),
    Supplier.find({ companyId }).lean(),
    EmissionRecordService.getSummary(companyId),
  ]);

  const normalizedShipments = shipments
    .map((shipment) => normalizeShipmentRecord(shipment, settings.emissionFactorOverrides || {}))
    .filter(Boolean);
  const shipmentTotalsBySupplierId = buildSupplierShipmentTotals(normalizedShipments);
  const normalizedSuppliers = suppliers
    .map((supplier) => normalizeSupplierRecord(supplier, shipmentTotalsBySupplierId))
    .filter(Boolean);

  let contextShipments = [];
  let contextSuppliers = [];

  if (options.shipmentId) {
    const shipmentId = normalizeId(options.shipmentId);
    contextShipments = pickShipmentContextShipments(normalizedShipments, shipmentId);
    contextSuppliers = pickShipmentContextSuppliers(normalizedSuppliers, normalizedShipments, shipmentId);
  } else if (options.supplierId) {
    const supplierId = normalizeId(options.supplierId);
    contextShipments = pickSupplierContextShipments(normalizedShipments, supplierId);
    contextSuppliers = pickSupplierContextSuppliers(normalizedSuppliers, supplierId);
  } else {
    contextShipments = pickGlobalShipments(normalizedShipments);
    contextSuppliers = pickGlobalSuppliers(normalizedSuppliers);
  }

  const scope3 = round(contextShipments.reduce((sum, shipment) => sum + Number(shipment.emissions || 0), 0), 4);
  const scope1 = round(Number(companySummary.scope1 || 0), 4);
  const scope2 = round(Number(companySummary.scope2 || 0), 4);

  return {
    carbonLedger: {
      shipments: contextShipments.map(stripShipmentForLedger),
      suppliers: contextSuppliers.map(stripSupplierForLedger),
      summary: {
        totalEmissions: round(scope1 + scope2 + scope3, 4),
        scopeBreakdown: {
          Scope1: scope1,
          Scope2: scope2,
          Scope3: scope3,
        },
      },
    },
  };
}

module.exports = {
  buildCarbonLedger,
  __internal: {
    buildSupplierShipmentTotals,
    normalizeShipmentRecord,
    normalizeSupplierRecord,
    pickShipmentContextShipments,
    pickShipmentContextSuppliers,
    pickSupplierContextShipments,
    pickSupplierContextSuppliers,
    pickGlobalShipments,
    pickGlobalSuppliers,
    withinDistanceWindow,
  },
};
