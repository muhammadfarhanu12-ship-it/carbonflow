const { Shipment, Supplier } = require("../models");
const BaseService = require("./base.service");
const { calculateShipmentEmissions, round } = require("./carbonEngine");
const EmissionRecordService = require("./emissionRecord.service");
const AuditService = require("./audit.service");

function calculateCarbonCost(emissionsTonnes, carbonPricePerTon) {
  return round(Number(emissionsTonnes || 0) * Number(carbonPricePerTon || 0), 2);
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

    return {
      ...shipmentEmissions,
      emissionsTonnes,
      carbonCostUsd,
    };
  }

  static async create(payload, companyId, carbonPricePerTon, actor = null, emissionFactorOverrides = {}) {
    const supplier = await this.getSupplier(companyId, payload.supplierId);
    const merged = {
      ...payload,
      companyId,
      carbonPricePerTon: payload.carbonPricePerTon || carbonPricePerTon,
      shipmentDate: payload.shipmentDate || payload.date || new Date(),
    };
    const calculatedFields = this.calculateFields(merged, emissionFactorOverrides);

    const shipment = await Shipment.create({
      ...payload,
      companyId,
      carbonPricePerTon: merged.carbonPricePerTon,
      shipmentDate: merged.shipmentDate,
      emissionsTonnes: calculatedFields.emissionsTonnes,
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

    const supplier = await this.getSupplier(companyId, payload.supplierId || shipment.supplierId);
    const merged = {
      ...shipment.toJSON(),
      ...payload,
      carbonPricePerTon: payload.carbonPricePerTon || shipment.carbonPricePerTon || carbonPricePerTon,
      shipmentDate: payload.shipmentDate || payload.date || shipment.shipmentDate || shipment.createdAt,
    };
    const calculatedFields = this.calculateFields(merged, emissionFactorOverrides);

    await shipment.update({
      ...payload,
      carbonPricePerTon: merged.carbonPricePerTon,
      shipmentDate: merged.shipmentDate,
      emissionsTonnes: calculatedFields.emissionsTonnes,
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
