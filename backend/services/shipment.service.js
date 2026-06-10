const { Shipment, Supplier } = require("../models");
const BaseService = require("./base.service");
const { DEFAULT_EMISSION_FACTORS, round, toKgFromTonnes } = require("./carbonEngine");
const EmissionFactorService = require("./emissionFactor.service");
const EmissionRecordService = require("./emissionRecord.service");
const AuditService = require("./audit.service");

const ACTIVE_STATUSES = ["DRAFT", "SUBMITTED", "PLANNED", "IN_TRANSIT", "DELAYED", "DELIVERED"];
const MODE_FACTOR_KEYS = {
  AIR: ["AIR", "AIR_FREIGHT"],
  ROAD: ["ROAD", "ROAD_FREIGHT"],
  OCEAN: ["OCEAN", "SEA_FREIGHT"],
  RAIL: ["RAIL", "RAIL_FREIGHT"],
};

function normalizeString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeOptionalUuid(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeShipmentStatus(value) {
  const normalized = String(value || "DRAFT").trim().toUpperCase();
  const aliasMap = {
    draft: "DRAFT",
    submitted: "SUBMITTED",
    planned: "PLANNED",
    in_transit: "IN_TRANSIT",
    intransit: "IN_TRANSIT",
    delayed: "DELAYED",
    delivered: "DELIVERED",
    cancelled: "CANCELLED",
    canceled: "CANCELLED",
    archived: "ARCHIVED",
  };
  return aliasMap[normalized.toLowerCase()] || normalized;
}

function normalizeTransportMode(value) {
  const normalized = String(value || "ROAD").trim().toUpperCase();
  if (["SEA", "SHIP", "VESSEL"].includes(normalized)) return "OCEAN";
  return normalized;
}

function buildReportingPeriod(value, shipmentDate) {
  const normalized = normalizeString(value);
  if (normalized) return normalized;
  const date = new Date(shipmentDate || Date.now());
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildShipmentFormula(distanceKm, weightKg, factorValue) {
  const tonnes = round(Number(weightKg || 0) / 1000, 4);
  const tonKm = round(Number(distanceKm || 0) * tonnes, 4);
  const kgCo2e = round(tonKm * Number(factorValue || 0), 4);
  const tCo2e = round(kgCo2e / 1000, 6);
  return `${distanceKm} km x ${tonnes} tonnes x ${factorValue} kgCO2e/ton-km = ${kgCo2e} kgCO2e = ${tCo2e} tCO2e`;
}

function factorTypeFor(factor) {
  if (!factor) return "missing";
  if (factor.isSample !== false) return "sample";
  if (factor.isCustom === true || String(factor.companyId || "").trim()) return "custom";
  if (factor.isOfficial === true) return "official";
  return "missing";
}

function sampleFactorForMode(mode) {
  const factorValue = Number(DEFAULT_EMISSION_FACTORS.scope3.transportKgPerTonKm[mode] || 0);
  if (!(factorValue > 0)) return null;
  return {
    id: `sample-shipment-${mode.toLowerCase()}`,
    factorKey: MODE_FACTOR_KEYS[mode][0],
    factorValue,
    factorUnit: "kgCO2e/ton-km",
    sourceName: "CarbonFlow sample logistics factors",
    sourceYear: 2026,
    region: "GLOBAL",
    isSample: true,
    isOfficial: false,
    isCustom: false,
  };
}

async function resolveShipmentFactor(criteria = {}) {
  const keys = MODE_FACTOR_KEYS[criteria.transportMode] || [criteria.transportMode];
  for (const factorKey of keys) {
    const factor = await EmissionFactorService.resolveBestMatch({
      companyId: criteria.companyId,
      scope: 3,
      category: "Upstream transportation and distribution",
      activityType: "upstream_transportation",
      factorKey,
      activityUnit: "ton-km",
      country: criteria.destinationCountry || criteria.originCountry || null,
      region: criteria.destinationRegion || criteria.originRegion || "GLOBAL",
      occurredAt: criteria.shipmentDate,
    });
    if (factor) return factor;
  }
  return sampleFactorForMode(criteria.transportMode);
}

function buildSupplierSnapshot(supplier) {
  if (!supplier) return null;
  return {
    id: String(supplier.id || supplier._id || ""),
    name: supplier.name || null,
    category: supplier.category || null,
    country: supplier.country || null,
    region: supplier.region || null,
    riskLevel: supplier.riskLevel || null,
  };
}

function normalizeShipmentPayload(payload = {}) {
  const weightUnit = String(payload.weightUnit || "kg").toLowerCase();
  const weightSource = payload.weightKg ?? payload.weight ?? 0;
  const normalizedWeightKg = weightUnit === "tonnes" ? Number(weightSource || 0) * 1000 : Number(weightSource || 0);
  const shipmentDate = payload.shipmentDate || payload.date || new Date().toISOString();
  const normalized = {
    ...payload,
    supplierId: normalizeOptionalUuid(payload.linkedSupplierId ?? payload.supplierId),
    linkedSupplierId: normalizeOptionalUuid(payload.linkedSupplierId ?? payload.supplierId),
    shipmentReference: normalizeString(payload.shipmentReference || payload.reference),
    reference: normalizeString(payload.reference || payload.shipmentReference),
    bolNumber: normalizeString(payload.bolNumber || payload.billOfLading),
    containerId: normalizeString(payload.containerId),
    origin: String(payload.origin || "").trim(),
    originCountry: normalizeString(payload.originCountry),
    originRegion: normalizeString(payload.originRegion),
    destination: String(payload.destination || "").trim(),
    destinationCountry: normalizeString(payload.destinationCountry),
    destinationRegion: normalizeString(payload.destinationRegion),
    transportMode: normalizeTransportMode(payload.transportMode || payload.mode),
    carrier: String(payload.carrier || "").trim(),
    carrierId: normalizeString(payload.carrierId),
    distanceKm: Number(payload.distanceKm || 0),
    distanceUnit: "km",
    weightKg: normalizedWeightKg,
    weightUnit: "kg",
    costUsd: Number(payload.costUsd ?? payload.cost ?? 0),
    cost: Number(payload.cost ?? payload.costUsd ?? 0),
    currency: String(payload.currency || "USD").trim().toUpperCase() || "USD",
    shipmentDate,
    reportingPeriod: buildReportingPeriod(payload.reportingPeriod, shipmentDate),
    status: normalizeShipmentStatus(payload.status),
    notes: normalizeString(payload.notes),
    distanceSource: String(payload.distanceSource || (Number(payload.distanceKm || 0) > 0 ? "MANUAL" : "ESTIMATED")).toUpperCase(),
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
  };

  return normalized;
}

class ShipmentService extends BaseService {
  static async list(query = {}, companyId) {
    const filter = {
      companyId,
      ...this.getLikeFilter(["reference", "origin", "destination", "carrier", "bolNumber", "containerId"], query.search),
    };

    if (query.transportMode || query.mode) filter.transportMode = normalizeTransportMode(query.transportMode || query.mode);
    if (query.activeOnly === true || query.activeOnly === "true" || query.activeOnly === 1 || query.activeOnly === "1") {
      filter.status = { $in: ACTIVE_STATUSES.filter((status) => !["CANCELLED", "ARCHIVED"].includes(status)) };
      filter.archivedAt = null;
    } else if (query.status) {
      filter.status = normalizeShipmentStatus(query.status);
    }
    if (query.supplierId) filter.linkedSupplierId = query.supplierId;
    if (query.factorType) filter.emissionFactorType = String(query.factorType).trim().toLowerCase();
    if (query.calculationStatus) filter.calculationStatus = String(query.calculationStatus).trim().toLowerCase();
    if (query.carrier) filter.carrier = { $regex: String(query.carrier), $options: "i" };
    if (query.dateFrom || query.dateTo) {
      filter.shipmentDate = {};
      if (query.dateFrom) filter.shipmentDate.$gte = new Date(query.dateFrom);
      if (query.dateTo) filter.shipmentDate.$lte = new Date(query.dateTo);
    }

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
    if (!supplierId) return null;
    const supplier = await Supplier.findOne({ _id: supplierId, companyId });
    if (!supplier) {
      const error = new Error("Supplier not found");
      error.status = 404;
      throw error;
    }
    return supplier;
  }

  static async calculateFields(payload = {}, companyId = null) {
    const distanceKm = Number(payload.distanceKm || 0);
    const weightKg = Number(payload.weightKg || 0);
    const transportMode = normalizeTransportMode(payload.transportMode || payload.mode);
    const tonKm = round(distanceKm * (weightKg / 1000), 4);
    const warnings = [];

    if (!(distanceKm > 0) || !(weightKg > 0)) {
      return {
        transportMode,
        tonKm,
        emissionsTonnes: 0,
        emissionsKgCo2e: 0,
        emissionFactor: 0,
        emissionFactorId: null,
        emissionFactorKey: MODE_FACTOR_KEYS[transportMode]?.[0] || transportMode,
        emissionFactorValue: 0,
        emissionFactorUnit: "kgCO2e/ton-km",
        emissionFactorSourceName: null,
        emissionFactorSourceYear: null,
        emissionFactorType: "missing",
        factorSource: "Emission factor missing",
        calculationFormula: null,
        calculationStatus: "invalid_input",
        carbonIntensityKgCo2ePerTonKm: 0,
        kgCO2e: 0,
        tCO2e: 0,
        carbonCostUsd: 0,
        calculatedAt: new Date(),
        dataQualityWarnings: ["Distance and weight must both be greater than zero to calculate shipment emissions."],
      };
    }

    const factor = await resolveShipmentFactor({
      companyId,
      transportMode,
      originCountry: payload.originCountry,
      originRegion: payload.originRegion,
      destinationCountry: payload.destinationCountry,
      destinationRegion: payload.destinationRegion,
      shipmentDate: payload.shipmentDate,
    });

    const emissionFactorValue = Number(factor?.factorValue ?? factor?.value ?? 0);
    const kgCO2e = round(tonKm * emissionFactorValue, 4);
    const tCO2e = round(kgCO2e / 1000, 6);
    const factorType = factorTypeFor(factor);
    if (factorType === "sample") warnings.push("Sample emission factor used. Replace with an official or company custom factor for reporting-grade outputs.");
    if (factorType === "missing") warnings.push("No matching emission factor was found for this shipment.");

    return {
      transportMode,
      tonKm,
      emissionsTonnes: tCO2e,
      emissionsKgCo2e: kgCO2e,
      emissionFactor: emissionFactorValue,
      emissionFactorId: factor?._id || factor?.id || null,
      emissionFactorKey: factor?.factorKey || factor?.key || MODE_FACTOR_KEYS[transportMode]?.[0] || transportMode,
      emissionFactorValue,
      emissionFactorUnit: factor?.factorUnit || "kgCO2e/ton-km",
      emissionFactorSourceName: factor?.sourceName || factor?.source || null,
      emissionFactorSourceYear: factor?.sourceYear || null,
      emissionFactorType: factorType,
      factorSource: factor?.sourceName || factor?.source || (factorType === "missing" ? "Emission factor missing" : "CarbonFlow sample logistics factors"),
      calculationFormula: emissionFactorValue > 0 ? buildShipmentFormula(distanceKm, weightKg, emissionFactorValue) : null,
      calculationStatus: emissionFactorValue > 0 ? (factorType === "sample" ? "estimated" : "calculated") : "missing_factor",
      carbonIntensityKgCo2ePerTonKm: tonKm > 0 ? round(kgCO2e / tonKm, 6) : 0,
      kgCO2e,
      tCO2e,
      carbonCostUsd: 0,
      calculatedAt: new Date(),
      dataQualityWarnings: warnings,
    };
  }

  static async syncShipmentArtifacts(shipment, supplier, actor, oldValue = null, action = "shipment_updated") {
    await EmissionRecordService.syncShipmentRecord(shipment, supplier);
    await AuditService.log({
      companyId: shipment.companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action,
      entityType: "Shipment",
      entityId: shipment.id,
      oldValue,
      newValue: shipment.toObject ? shipment.toObject() : shipment,
      details: {
        shipmentReference: shipment.reference,
        status: shipment.status,
        calculationStatus: shipment.calculationStatus,
        emissionFactorType: shipment.emissionFactorType,
        linkedSupplierId: shipment.linkedSupplierId || null,
      },
    });
  }

  static async create(payload, companyId, carbonPricePerTon, actor = null) {
    const normalizedPayload = normalizeShipmentPayload(payload);
    const supplier = await this.getSupplier(companyId, normalizedPayload.linkedSupplierId);
    const calculatedFields = await this.calculateFields(normalizedPayload, companyId);

    const shipment = await Shipment.create({
      ...normalizedPayload,
      companyId,
      supplierId: supplier?.id || null,
      linkedSupplierId: supplier?.id || null,
      linkedSupplierSnapshot: buildSupplierSnapshot(supplier),
      carbonPricePerTon: Number(normalizedPayload.carbonPricePerTon || carbonPricePerTon || 0),
      emissionFactor: calculatedFields.emissionFactor,
      factorSource: calculatedFields.factorSource,
      emissionFactorId: calculatedFields.emissionFactorId,
      emissionFactorKey: calculatedFields.emissionFactorKey,
      emissionFactorValue: calculatedFields.emissionFactorValue,
      emissionFactorUnit: calculatedFields.emissionFactorUnit,
      emissionFactorSourceName: calculatedFields.emissionFactorSourceName,
      emissionFactorSourceYear: calculatedFields.emissionFactorSourceYear,
      emissionFactorType: calculatedFields.emissionFactorType,
      calculationFormula: calculatedFields.calculationFormula,
      emissionsKgCo2e: calculatedFields.emissionsKgCo2e,
      emissionsTonnes: calculatedFields.emissionsTonnes,
      kgCO2e: calculatedFields.kgCO2e,
      tCO2e: calculatedFields.tCO2e,
      carbonIntensityKgCo2ePerTonKm: calculatedFields.carbonIntensityKgCo2ePerTonKm,
      calculationStatus: calculatedFields.calculationStatus,
      dataQualityWarnings: calculatedFields.dataQualityWarnings,
      calculatedAt: calculatedFields.calculatedAt,
      carbonCostUsd: round(Number(calculatedFields.emissionsTonnes || 0) * Number(normalizedPayload.carbonPricePerTon || carbonPricePerTon || 0), 2),
      createdBy: actor?.id || null,
      updatedBy: actor?.id || null,
    });

    const hydratedShipment = await this.getById(shipment.id, companyId);
    await this.syncShipmentArtifacts(hydratedShipment, supplier, actor, null, "shipment_created");
    if (supplier) {
      await AuditService.log({
        companyId,
        userId: actor?.id || null,
        userEmail: actor?.email || null,
        action: "shipment_supplier_linked",
        entityType: "Shipment",
        entityId: shipment.id,
        details: { supplierId: supplier.id, supplierName: supplier.name },
      });
    }
    return hydratedShipment;
  }

  static async update(id, payload, companyId, carbonPricePerTon, actor = null) {
    const shipment = await Shipment.findOne({ _id: id, companyId });
    if (!shipment) {
      const error = new Error("Shipment not found");
      error.status = 404;
      throw error;
    }
    if (shipment.status === "ARCHIVED" || shipment.archivedAt) {
      const error = new Error("Archived shipments cannot be edited. Use a dedicated unarchive flow before updating.");
      error.status = 409;
      throw error;
    }

    const oldValue = shipment.toObject();
    const normalizedPayload = normalizeShipmentPayload({ ...shipment.toObject(), ...payload });
    const supplier = await this.getSupplier(companyId, normalizedPayload.linkedSupplierId);
    const calculatedFields = await this.calculateFields(normalizedPayload, companyId);

    await shipment.update({
      ...normalizedPayload,
      supplierId: supplier?.id || null,
      linkedSupplierId: supplier?.id || null,
      linkedSupplierSnapshot: buildSupplierSnapshot(supplier),
      carbonPricePerTon: Number(normalizedPayload.carbonPricePerTon || shipment.carbonPricePerTon || carbonPricePerTon || 0),
      emissionFactor: calculatedFields.emissionFactor,
      factorSource: calculatedFields.factorSource,
      emissionFactorId: calculatedFields.emissionFactorId,
      emissionFactorKey: calculatedFields.emissionFactorKey,
      emissionFactorValue: calculatedFields.emissionFactorValue,
      emissionFactorUnit: calculatedFields.emissionFactorUnit,
      emissionFactorSourceName: calculatedFields.emissionFactorSourceName,
      emissionFactorSourceYear: calculatedFields.emissionFactorSourceYear,
      emissionFactorType: calculatedFields.emissionFactorType,
      calculationFormula: calculatedFields.calculationFormula,
      emissionsKgCo2e: calculatedFields.emissionsKgCo2e,
      emissionsTonnes: calculatedFields.emissionsTonnes,
      kgCO2e: calculatedFields.kgCO2e,
      tCO2e: calculatedFields.tCO2e,
      carbonIntensityKgCo2ePerTonKm: calculatedFields.carbonIntensityKgCo2ePerTonKm,
      calculationStatus: calculatedFields.calculationStatus,
      dataQualityWarnings: calculatedFields.dataQualityWarnings,
      calculatedAt: calculatedFields.calculatedAt,
      carbonCostUsd: round(Number(calculatedFields.emissionsTonnes || 0) * Number(normalizedPayload.carbonPricePerTon || shipment.carbonPricePerTon || carbonPricePerTon || 0), 2),
      updatedBy: actor?.id || null,
    });

    const hydratedShipment = await this.getById(id, companyId);
    await this.syncShipmentArtifacts(hydratedShipment, supplier, actor, oldValue, "shipment_updated");
    return hydratedShipment;
  }

  static async recalculate(id, companyId, actor = null) {
    const shipment = await this.getById(id, companyId);
    const oldValue = shipment.toObject ? shipment.toObject() : shipment;
    const supplier = await this.getSupplier(companyId, shipment.linkedSupplierId || shipment.supplierId);
    const calculatedFields = await this.calculateFields(shipment.toObject ? shipment.toObject() : shipment, companyId);

    await shipment.update({
      emissionFactor: calculatedFields.emissionFactor,
      factorSource: calculatedFields.factorSource,
      emissionFactorId: calculatedFields.emissionFactorId,
      emissionFactorKey: calculatedFields.emissionFactorKey,
      emissionFactorValue: calculatedFields.emissionFactorValue,
      emissionFactorUnit: calculatedFields.emissionFactorUnit,
      emissionFactorSourceName: calculatedFields.emissionFactorSourceName,
      emissionFactorSourceYear: calculatedFields.emissionFactorSourceYear,
      emissionFactorType: calculatedFields.emissionFactorType,
      calculationFormula: calculatedFields.calculationFormula,
      emissionsKgCo2e: calculatedFields.emissionsKgCo2e,
      emissionsTonnes: calculatedFields.emissionsTonnes,
      kgCO2e: calculatedFields.kgCO2e,
      tCO2e: calculatedFields.tCO2e,
      carbonIntensityKgCo2ePerTonKm: calculatedFields.carbonIntensityKgCo2ePerTonKm,
      calculationStatus: calculatedFields.calculationStatus,
      dataQualityWarnings: calculatedFields.dataQualityWarnings,
      calculatedAt: calculatedFields.calculatedAt,
      carbonCostUsd: round(Number(calculatedFields.emissionsTonnes || 0) * Number(shipment.carbonPricePerTon || 0), 2),
      updatedBy: actor?.id || null,
    });

    const hydratedShipment = await this.getById(id, companyId);
    await this.syncShipmentArtifacts(hydratedShipment, supplier, actor, oldValue, "shipment_emissions_recalculated");
    return hydratedShipment;
  }

  static async archive(id, companyId, actor = null) {
    const shipment = await Shipment.findOne({ _id: id, companyId });
    if (!shipment) {
      const error = new Error("Shipment not found");
      error.status = 404;
      throw error;
    }

    const oldValue = shipment.toObject();
    await shipment.update({
      status: "ARCHIVED",
      archivedAt: new Date(),
      archivedBy: actor?.id || null,
      updatedBy: actor?.id || null,
    });
    const hydratedShipment = await this.getById(id, companyId);
    await this.syncShipmentArtifacts(hydratedShipment, null, actor, oldValue, "shipment_archived");
    return hydratedShipment;
  }

  static async importRows(rows = [], companyId, carbonPricePerTon, actor = null, importContext = {}) {
    const summary = {
      total: rows.length,
      successful: 0,
      ["\u0938\u092B\u0932"]: 0,
      failed: 0,
      inserted: 0,
      updated: 0,
    };
    const errors = [];
    const createdRecords = [];

    for (const row of rows) {
      const rowIndex = Number(row?.rowIndex || 0);
      const shipmentReference = normalizeString(row?.shipmentReference || row?.reference);

      try {
        const existingShipment = shipmentReference
          ? await Shipment.findOne({ companyId, reference: shipmentReference }).select("_id reference").lean()
          : null;
        const payload = {
          ...row,
          reference: shipmentReference,
          shipmentReference,
          metadata: {
            ...(row?.metadata && typeof row.metadata === "object" ? row.metadata : {}),
            importId: importContext.importId || importContext.uploadId || null,
            importSource: importContext.source || null,
            importFileName: importContext.fileName || null,
            importTemplateName: importContext.templateName || null,
            importBatchIndex: importContext.batchIndex ?? null,
            importUploadId: importContext.uploadId || importContext.importId || null,
            importRowIndex: rowIndex || null,
          },
        };

        const shipment = existingShipment
          ? await this.update(existingShipment._id, payload, companyId, carbonPricePerTon, actor)
          : await this.create(payload, companyId, carbonPricePerTon, actor);

        summary.successful += 1;
        summary["\u0938\u092B\u0932"] = summary.successful;
        if (existingShipment) summary.updated += 1;
        else summary.inserted += 1;
        createdRecords.push({
          id: shipment.id,
          type: "shipment",
          reference: shipment.shipmentReference || shipment.reference,
        });

        await AuditService.log({
          companyId,
          userId: actor?.id || null,
          userEmail: actor?.email || null,
          action: existingShipment ? "shipment_imported_updated" : "shipment_imported_created",
          entityType: "Shipment",
          entityId: shipment.id,
          details: {
            importId: importContext.importId || importContext.uploadId || null,
            importSource: importContext.source || null,
            shipmentId: shipment.id,
            shipmentReference: shipment.shipmentReference || shipment.reference,
            calculationStatus: shipment.calculationStatus || null,
            factorUsed: {
              id: shipment.emissionFactorId || null,
              key: shipment.emissionFactorKey || null,
              value: shipment.emissionFactorValue ?? shipment.emissionFactor ?? null,
              unit: shipment.emissionFactorUnit || null,
              sourceName: shipment.emissionFactorSourceName || shipment.factorSource || null,
              sourceYear: shipment.emissionFactorSourceYear || null,
              type: shipment.emissionFactorType || null,
            },
            importedAt: new Date(),
          },
        });
      } catch (error) {
        errors.push({
          rowIndex,
          field: "row",
          message: error?.message || "Shipment import failed",
        });
      }
    }

    summary.failed = errors.length;

    return {
      summary,
      errors,
      createdRecords,
    };
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
      details: { shipmentReference: shipment.reference },
    });
    return { success: true };
  }
}

module.exports = ShipmentService;
