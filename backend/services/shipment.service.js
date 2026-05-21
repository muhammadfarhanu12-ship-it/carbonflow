const { Shipment, Supplier } = require("../models");
const BaseService = require("./base.service");
const { calculateShipmentEmissions, round, toKgFromTonnes } = require("./carbonEngine");
const EmissionRecordService = require("./emissionRecord.service");
const AuditService = require("./audit.service");

const DEFAULT_MANUAL_SUPPLIER_NAME = "Manual Shipment Supplier";
const SHIPMENT_FACTOR_SOURCE = "CarbonFlow sample logistics factors";

function calculateCarbonCost(emissionsTonnes, carbonPricePerTon) {
  return round(Number(emissionsTonnes || 0) * Number(carbonPricePerTon || 0), 2);
}

function normalizeShipmentPayload(payload = {}) {
  const weightUnit = String(payload.weightUnit || "kg").toLowerCase();
  const hasWeight = payload.weightKg !== undefined && payload.weightKg !== null && payload.weightKg !== "";
  const weightKg = weightUnit === "tonnes"
    ? Number(payload.weightKg || 0) * 1000
    : Number(payload.weightKg || 0);
  const normalized = {
    ...payload,
    distanceUnit: "km",
    weightUnit: "kg",
    currency: "USD",
  };

  if (payload.distanceKm !== undefined) normalized.distanceKm = Number(payload.distanceKm || 0);
  if (hasWeight) normalized.weightKg = weightKg;
  if (payload.costUsd !== undefined) normalized.costUsd = Number(payload.costUsd || 0);

  return normalized;
}

class ShipmentService extends BaseService {
  static async list(query = {}, companyId) {
    const filter = {
      companyId,
      ...this.getLikeFilter(["reference", "origin", "destination", "carrier"], query.search),
    };

    if (query.transportMode) filter.transportMode = query.transportMode;
    if (query.activeOnly === true || query.activeOnly === "true" || query.activeOnly === 1 || query.activeOnly === "1") {
      filter.status = { $in: ["PLANNED", "IN_TRANSIT", "DELAYED"] };
    } else if (query.status) {
      filter.status = query.status;
    }
    if (query.supplierId) filter.supplierId = query.supplierId;

    return this.buildListResult(Shipment, {
      query,
      filter,
      populate: [{ path: "supplier", model: "Supplier" }],
      sort: { shipmentDate: -1, createdAt: -1 },
    });
  }

  static async getById(id, companyId) {
    const shipment = await Shipment.findOne({ _id: id, companyId }).populate({ path: "supplier", model: "Supplier" });

    if (!shipment) {
      const error = new Error("Shipment not found");
      error.status = 404;
      throw error;
    }

    return shipment;
  }

  static async getSupplier(companyId, supplierId) {
    if (!supplierId) {
      const existingSupplier = await Supplier.findOne({
        companyId,
        name: { $regex: /^Manual Shipment Supplier$/i },
      });

      if (existingSupplier) {
        return existingSupplier;
      }

      return Supplier.create({
        companyId,
        name: DEFAULT_MANUAL_SUPPLIER_NAME,
        contactEmail: "ops+manual-shipments@carbonflow.local",
        country: "Unknown",
        region: "Global",
        category: "Logistics",
        verificationStatus: "PENDING",
        invitationStatus: "NOT_SENT",
        onTimeDeliveryRate: 95,
        renewableRatio: 0,
        complianceFlags: 0,
        totalEmissions: 0,
        carbonScore: 75,
        riskScore: 25,
        riskLevel: "LOW",
      });
    }

    const supplier = await Supplier.findOne({ _id: supplierId, companyId });

    if (!supplier) {
      const error = new Error("Supplier not found");
      error.status = 404;
      throw error;
    }

    return supplier;
  }

  static calculateFields(payload = {}, emissionFactorOverrides = {}) {
    const shipmentEmissions = calculateShipmentEmissions(payload, emissionFactorOverrides);
    const emissionsTonnes = shipmentEmissions.emissionsTonnes;
    const carbonCostUsd = calculateCarbonCost(emissionsTonnes, payload.carbonPricePerTon);
    const emissionFactor = shipmentEmissions.factorKgPerTonKm;

    return {
      ...shipmentEmissions,
      emissionsTonnes,
      emissionsKgCo2e: toKgFromTonnes(emissionsTonnes),
      emissionFactor,
      factorSource: emissionFactor > 0 ? SHIPMENT_FACTOR_SOURCE : "Emission factor missing",
      calculationStatus: emissionFactor > 0 ? "calculated" : "missing_factor",
      carbonCostUsd,
    };
  }

  static async create(payload, companyId, carbonPricePerTon, actor = null, emissionFactorOverrides = {}) {
    const normalizedPayload = normalizeShipmentPayload(payload);
    const supplier = await this.getSupplier(companyId, normalizedPayload.supplierId);
    const merged = {
      ...normalizedPayload,
      companyId,
      carbonPricePerTon: normalizedPayload.carbonPricePerTon || carbonPricePerTon,
      shipmentDate: normalizedPayload.shipmentDate || normalizedPayload.date || new Date(),
    };
    const calculatedFields = this.calculateFields(merged, emissionFactorOverrides);

    const shipment = await Shipment.create({
      ...normalizedPayload,
      companyId,
      supplierId: supplier.id,
      distanceUnit: "km",
      weightUnit: "kg",
      currency: "USD",
      carbonPricePerTon: merged.carbonPricePerTon,
      shipmentDate: merged.shipmentDate,
      emissionFactor: calculatedFields.emissionFactor,
      factorSource: calculatedFields.factorSource,
      emissionsKgCo2e: calculatedFields.emissionsKgCo2e,
      emissionsTonnes: calculatedFields.emissionsTonnes,
      calculationStatus: calculatedFields.calculationStatus,
      carbonCostUsd: calculatedFields.carbonCostUsd,
    });

    const hydratedShipment = await this.getById(shipment.id, companyId);
    await EmissionRecordService.syncShipmentRecord(hydratedShipment, supplier);
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "shipment.created",
      entityType: "Shipment",
      entityId: shipment.id,
      details: {
        reference: shipment.reference,
        transportMode: shipment.transportMode,
        emissionsTonnes: shipment.emissionsTonnes,
      },
    });

    return hydratedShipment;
  }

  static async update(id, payload, companyId, carbonPricePerTon, actor = null, emissionFactorOverrides = {}) {
    const shipment = await Shipment.findOne({ _id: id, companyId });
    if (!shipment) {
      const error = new Error("Shipment not found");
      error.status = 404;
      throw error;
    }

    const normalizedPayload = normalizeShipmentPayload(payload);
    const supplier = await this.getSupplier(companyId, normalizedPayload.supplierId || shipment.supplierId);
    const merged = {
      ...shipment.toJSON(),
      ...normalizedPayload,
      carbonPricePerTon: normalizedPayload.carbonPricePerTon || shipment.carbonPricePerTon || carbonPricePerTon,
      shipmentDate: normalizedPayload.shipmentDate || normalizedPayload.date || shipment.shipmentDate || shipment.createdAt,
    };
    const calculatedFields = this.calculateFields(merged, emissionFactorOverrides);

    await shipment.update({
      ...normalizedPayload,
      supplierId: supplier.id,
      distanceUnit: "km",
      weightUnit: "kg",
      currency: "USD",
      carbonPricePerTon: merged.carbonPricePerTon,
      shipmentDate: merged.shipmentDate,
      emissionFactor: calculatedFields.emissionFactor,
      factorSource: calculatedFields.factorSource,
      emissionsKgCo2e: calculatedFields.emissionsKgCo2e,
      emissionsTonnes: calculatedFields.emissionsTonnes,
      calculationStatus: calculatedFields.calculationStatus,
      carbonCostUsd: calculatedFields.carbonCostUsd,
    });

    const hydratedShipment = await this.getById(id, companyId);
    await EmissionRecordService.syncShipmentRecord(hydratedShipment, supplier);
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "shipment.updated",
      entityType: "Shipment",
      entityId: id,
      details: {
        reference: hydratedShipment.reference,
        status: hydratedShipment.status,
        emissionsTonnes: hydratedShipment.emissionsTonnes,
      },
    });

    return hydratedShipment;
  }

  static async remove(id, companyId, actor = null) {
    const shipment = await Shipment.findOne({ _id: id, companyId });
    if (!shipment) {
      const error = new Error("Shipment not found");
      error.status = 404;
      throw error;
    }

    await shipment.destroy();
    await EmissionRecordService.deleteRecord(companyId, `shipment:${id}`);
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "shipment.deleted",
      entityType: "Shipment",
      entityId: id,
      details: {
        reference: shipment.reference,
      },
    });
    return { success: true };
  }
}

module.exports = ShipmentService;
