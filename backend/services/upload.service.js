const XLSX = require("xlsx");
const { Shipment, Supplier } = require("../models");
const ShipmentService = require("./shipment.service");
const SettingsService = require("./settings.service");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeTransportMode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (["ROAD", "RAIL", "AIR", "OCEAN"].includes(normalized)) return normalized;
  if (["SEA", "SHIP", "VESSEL"].includes(normalized)) return "OCEAN";
  return "ROAD";
}

function normalizeStatus(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (["PLANNED", "IN_TRANSIT", "DELAYED", "DELIVERED"].includes(normalized)) return normalized;
  return "IN_TRANSIT";
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

class UploadService {
  static parseFile(file) {
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
  }

  static mapRow(rawRow) {
    const row = Object.entries(rawRow).reduce((accumulator, [key, value]) => {
      accumulator[normalizeKey(key)] = value;
      return accumulator;
    }, {});

    return {
      supplierId: String(row.supplierid || "").trim(),
      supplierName: String(row.suppliername || row.supplier || "").trim(),
      contactEmail: String(row.contactemail || "").trim(),
      reference: String(row.reference || row.shipmentreference || "").trim(),
      origin: String(row.origin || row.from || "").trim(),
      destination: String(row.destination || row.to || "").trim(),
      distanceKm: toNumber(row.distancekm || row.distance || row.kilometers),
      transportMode: normalizeTransportMode(row.transportmode || row.mode),
      carrier: String(row.carrier || "").trim(),
      vehicleType: String(row.vehicletype || "").trim(),
      fuelType: String(row.fueltype || "").trim(),
      weightKg: toNumber(row.weightkg || row.weight),
      costUsd: toNumber(row.costusd || row.cost || row.amountusd),
      status: normalizeStatus(row.status),
    };
  }

  static async resolveSupplier(row, companyId) {
    if (row.supplierId) {
      const supplier = await Supplier.findOne({ _id: row.supplierId, companyId });
      if (supplier) return supplier;
    }

    if (!row.supplierName) {
      const error = new Error("supplierName or supplierId is required");
      error.statusCode = 422;
      throw error;
    }

    const existing = await Supplier.findOne({
      companyId,
      name: { $regex: `^${escapeRegex(row.supplierName)}$`, $options: "i" },
    });

    if (existing) return existing;

    return Supplier.create({
      companyId,
      name: row.supplierName,
      contactEmail: row.contactEmail || `ops+${row.supplierName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@carbonflow.local`,
      region: "Global",
      category: "Logistics",
      verificationStatus: "PENDING",
      invitationStatus: "NOT_SENT",
      onTimeDeliveryRate: 95,
      renewableRatio: 0.1,
      complianceFlags: 0,
      totalEmissions: 0,
      carbonScore: 75,
      riskScore: 25,
      riskLevel: "LOW",
    });
  }

  static validateRow(row) {
    const missing = [];

    if (!row.reference) missing.push("reference");
    if (!row.origin) missing.push("origin");
    if (!row.destination) missing.push("destination");
    if (!row.carrier) missing.push("carrier");
    if (!row.distanceKm) missing.push("distanceKm");
    if (!row.weightKg) missing.push("weightKg");
    if (row.costUsd < 0) missing.push("costUsd");

    if (missing.length > 0) {
      const error = new Error(`Missing or invalid fields: ${missing.join(", ")}`);
      error.statusCode = 422;
      throw error;
    }
  }

  static async ensureUniqueReference(reference, companyId, rowIndex) {
    const existing = await Shipment.findOne({ companyId, reference });
    if (!existing) return reference;
    return `${reference}-${String(rowIndex + 1).padStart(2, "0")}`;
  }

  static async processFile(file, companyId) {
    const rows = this.parseFile(file);
    const settings = await SettingsService.getByCompanyId(companyId);
    const createdShipments = [];
    const errors = [];

    for (const [index, rawRow] of rows.entries()) {
      try {
        const row = this.mapRow(rawRow);
        this.validateRow(row);
        const supplier = await this.resolveSupplier(row, companyId);
        const reference = await this.ensureUniqueReference(row.reference, companyId, index);

        const shipment = await ShipmentService.create({
          supplierId: supplier.id,
          reference,
          origin: row.origin,
          destination: row.destination,
          distanceKm: row.distanceKm,
          transportMode: row.transportMode,
          carrier: row.carrier,
          vehicleType: row.vehicleType || undefined,
          fuelType: row.fuelType || undefined,
          weightKg: row.weightKg,
          costUsd: row.costUsd,
          status: row.status,
          carbonPricePerTon: settings.carbonPricePerTon,
        }, companyId, settings.carbonPricePerTon);

        createdShipments.push(shipment);
      } catch (error) {
        errors.push({
          row: index + 2,
          message: error.message || "Row import failed",
        });
      }
    }

    return {
      fileName: file.originalname,
      importedRows: rows.length,
      createdCount: createdShipments.length,
      errorCount: errors.length,
      createdShipments,
      errors,
    };
  }
}

module.exports = UploadService;
