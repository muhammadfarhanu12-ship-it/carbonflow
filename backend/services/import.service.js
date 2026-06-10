const { randomUUID } = require("crypto");
const ApiError = require("../utils/ApiError");
const { Shipment, Supplier } = require("../models");
const SettingsService = require("./settings.service");
const ShipmentService = require("./shipment.service");
const { importRequestSchema, importRowSchema } = require("../validators/import.schema");

const IMPORT_BATCH_SIZE = 1000;
const DEFAULT_SUPPLIER_NAME = "Bulk Import Supplier";
const DEFAULT_CARRIER = "Imported Carrier";
const DEFAULT_ORIGIN = "Unknown Origin";

function sanitizeString(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return sanitizeString(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeTransportMode(value) {
  const normalizedValue = sanitizeString(value).toUpperCase();

  if (!normalizedValue) {
    return "ROAD";
  }

  if (["SEA", "SHIP", "VESSEL"].includes(normalizedValue)) {
    return "OCEAN";
  }

  return normalizedValue;
}

function normalizeStatus(value) {
  const normalizedValue = sanitizeString(value).toUpperCase();

  if (!normalizedValue) {
    return "DRAFT";
  }

  if (["DRAFT", "SUBMITTED", "PLANNED", "IN_TRANSIT", "DELAYED", "DELIVERED", "CANCELLED", "ARCHIVED"].includes(normalizedValue)) {
    return normalizedValue;
  }

  return "DRAFT";
}

function toNumber(value, fallbackValue = 0) {
  if (value === undefined || value === null || value === "") {
    return fallbackValue;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : value;
}

function sanitizeBulkErrorMessage(message) {
  return sanitizeString(message).replace(/\s+/g, " ");
}

function mapJoiErrorDetails(details, defaultField = "row") {
  return details.map((detail) => ({
    field: detail.path?.[0] || defaultField,
    message: detail.message.replace(/"/g, ""),
  }));
}

function buildValidationError(rowIndex, field, message, value) {
  const error = {
    rowIndex,
    field,
    message,
  };

  if (value !== undefined) {
    error.value = value;
  }

  return error;
}

function validateImportPayload(payload) {
  const { error, value } = importRequestSchema.validate(payload, {
    abortEarly: false,
    convert: true,
    stripUnknown: true,
  });

  if (error) {
    throw new ApiError(422, "Import payload validation failed", mapJoiErrorDetails(error.details, "payload"));
  }

  return value;
}

function sanitizeIncomingRow(row = {}) {
  return {
    rowIndex: Number(row.rowIndex),
    reference: sanitizeString(row.reference || row.shipmentReference),
    shipmentReference: sanitizeString(row.shipmentReference || row.reference),
    bolNumber: sanitizeString(row.bolNumber),
    containerId: sanitizeString(row.containerId),
    origin: sanitizeString(row.origin) || DEFAULT_ORIGIN,
    originCountry: sanitizeString(row.originCountry),
    originRegion: sanitizeString(row.originRegion),
    destination: sanitizeString(row.destination),
    destinationCountry: sanitizeString(row.destinationCountry),
    destinationRegion: sanitizeString(row.destinationRegion),
    weightKg: toNumber(row.weightKg, row.weightKg),
    distanceKm: toNumber(row.distanceKm, 0),
    transportMode: normalizeTransportMode(row.transportMode),
    carrierId: sanitizeString(row.carrierId),
    fuelType: sanitizeString(row.fuelType),
    supplierId: sanitizeString(row.linkedSupplierId || row.supplierId),
    linkedSupplierId: sanitizeString(row.linkedSupplierId || row.supplierId),
    supplierName: sanitizeString(row.supplierName) || DEFAULT_SUPPLIER_NAME,
    carrier: sanitizeString(row.carrier) || DEFAULT_CARRIER,
    costUsd: toNumber(row.costUsd ?? row.cost, 0),
    cost: toNumber(row.cost ?? row.costUsd, 0),
    currency: sanitizeString(row.currency).toUpperCase() || "USD",
    status: normalizeStatus(row.status),
    shipmentDate: sanitizeString(row.shipmentDate),
    reportingPeriod: sanitizeString(row.reportingPeriod),
    vehicleType: sanitizeString(row.vehicleType),
    notes: sanitizeString(row.notes),
    rawData: row.rawData && typeof row.rawData === "object" ? row.rawData : {},
  };
}

function validateImportRow(row) {
  const { error, value } = importRowSchema.validate(row, {
    abortEarly: false,
    convert: true,
    stripUnknown: true,
  });

  if (!error) {
    return {
      value,
      errors: [],
    };
  }

  return {
    value: null,
    errors: error.details.map((detail) => buildValidationError(
      row.rowIndex,
      detail.path?.[0] || "row",
      detail.message.replace(/"/g, ""),
      row[detail.path?.[0]],
    )),
  };
}

async function getOrCreateGenericSupplier(companyId) {
  const existingSupplier = await Supplier.findOne({
    companyId,
    name: { $regex: /^Bulk Import Supplier$/i },
  });

  if (existingSupplier) {
    return existingSupplier;
  }

  return Supplier.create({
    companyId,
    name: DEFAULT_SUPPLIER_NAME,
    contactEmail: "ops+bulk-import@carbonflow.local",
    country: "Unknown",
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

async function buildSupplierResolver(companyId, rows) {
  const requestedSupplierIds = [...new Set(rows.map((row) => row.supplierId).filter(Boolean))];
  const requestedSupplierNames = [...new Set(rows.map((row) => row.supplierName).filter(Boolean))];

  const [suppliersById, suppliersByName, genericSupplier] = await Promise.all([
    requestedSupplierIds.length > 0
      ? Supplier.find({ companyId, _id: { $in: requestedSupplierIds } })
      : [],
    requestedSupplierNames.length > 0
      ? Supplier.find({ companyId, name: { $in: requestedSupplierNames } })
      : [],
    getOrCreateGenericSupplier(companyId),
  ]);

  const idCache = new Map(suppliersById.map((supplier) => [supplier.id, supplier]));
  const nameCache = new Map(
    suppliersByName.map((supplier) => [normalizeKey(supplier.name), supplier]),
  );

  return {
    async resolve(row) {
      if (row.supplierId) {
        const supplierById = idCache.get(row.supplierId);
        if (supplierById) {
          return supplierById;
        }
        throw new Error(`Supplier not found for supplierId ${row.supplierId}`);
      }

      const normalizedSupplierName = normalizeKey(row.supplierName);
      if (!normalizedSupplierName) {
        return genericSupplier;
      }

      const cachedSupplier = nameCache.get(normalizedSupplierName);
      if (cachedSupplier) {
        return cachedSupplier;
      }

      const createdSupplier = await Supplier.create({
        companyId,
        name: row.supplierName,
        contactEmail: `ops+${normalizedSupplierName || "bulk-import"}@carbonflow.local`,
        country: "Unknown",
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

      nameCache.set(normalizedSupplierName, createdSupplier);
      return createdSupplier;
    },
  };
}

function buildShipmentReference(row, metadata) {
  if (row.shipmentReference || row.reference) {
    return row.shipmentReference || row.reference;
  }

  const uploadToken = sanitizeString(metadata.uploadId) || randomUUID().slice(0, 8);
  return `IMP-${uploadToken}-${String(row.rowIndex).padStart(6, "0")}`;
}

async function buildPersistableRows(rows, companyId, settings, metadata) {
  const supplierResolver = await buildSupplierResolver(companyId, rows);
  const persistableRows = [];
  const errors = [];

  for (const row of rows) {
    try {
      const supplier = await supplierResolver.resolve(row);
      persistableRows.push({
        rowIndex: row.rowIndex,
        reference: buildShipmentReference(row, metadata),
        payload: {
          ...row,
          reference: buildShipmentReference(row, metadata),
          shipmentReference: buildShipmentReference(row, metadata),
          linkedSupplierId: supplier.id,
          supplierId: supplier.id,
          supplierName: supplier.name,
          metadata: {
            importSource: metadata.source,
            importFileName: metadata.fileName || null,
            importUploadId: metadata.uploadId || null,
            importBatchIndex: metadata.batchIndex,
            importRowIndex: row.rowIndex,
            importTemplateName: metadata.templateName || null,
          },
        },
      });
    } catch (error) {
      errors.push(buildValidationError(
        row.rowIndex,
        "supplier",
        error.message || "Supplier resolution failed",
      ));
    }
  }

  return {
    persistableRows,
    errors,
  };
}

class ImportService {
  static async importShipments(payload, companyId, actor = null) {
    const { shipments, metadata } = validateImportPayload(payload);
    const settings = await SettingsService.getByCompanyId(companyId);
    const validationErrors = [];
    const validRows = [];

    shipments.forEach((shipment, shipmentIndex) => {
      if (!shipment || typeof shipment !== "object" || Array.isArray(shipment)) {
        validationErrors.push(buildValidationError(
          shipmentIndex + 2,
          "row",
          "Malformed row payload received",
        ));
        return;
      }

      const sanitizedRow = sanitizeIncomingRow(shipment);
      const { value, errors } = validateImportRow(sanitizedRow);

      if (errors.length > 0) {
        validationErrors.push(...errors);
        return;
      }

      validRows.push(value);
    });

    const { persistableRows, errors: supplierErrors } = await buildPersistableRows(
      validRows,
      companyId,
      settings,
      metadata,
    );
    const importResult = await ShipmentService.importRows(
      persistableRows.map((row) => row.payload),
      companyId,
      Number(settings.carbonPricePerTon || 0),
      actor,
      metadata,
    );
    const allErrors = [...validationErrors, ...supplierErrors, ...(importResult.errors || [])]
      .sort((leftError, rightError) => leftError.rowIndex - rightError.rowIndex);
    const totalRows = shipments.length;
    const successful = Number(importResult.summary?.successful || 0);
    const failed = new Set(allErrors.map((error) => error.rowIndex)).size;

    return {
      summary: {
        total: totalRows,
        successful,
        ["\u0938\u092B\u0932"]: successful,
        failed,
        inserted: Number(importResult.summary?.inserted || 0),
        updated: Number(importResult.summary?.updated || 0),
      },
      errors: allErrors,
      createdRecords: importResult.createdRecords || [],
      metadata: {
        ...metadata,
        processedRows: totalRows,
      },
    };
  }
}

module.exports = ImportService;
