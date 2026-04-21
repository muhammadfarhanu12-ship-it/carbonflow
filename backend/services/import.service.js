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
    return "IN_TRANSIT";
  }

  if (["PLANNED", "IN_TRANSIT", "DELAYED", "DELIVERED"].includes(normalizedValue)) {
    return normalizedValue;
  }

  return "IN_TRANSIT";
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
    origin: sanitizeString(row.origin) || DEFAULT_ORIGIN,
    destination: sanitizeString(row.destination),
    weightKg: toNumber(row.weightKg, row.weightKg),
    distanceKm: toNumber(row.distanceKm, 0),
    transportMode: normalizeTransportMode(row.transportMode),
    fuelType: sanitizeString(row.fuelType),
    reference: sanitizeString(row.reference),
    supplierId: sanitizeString(row.supplierId),
    supplierName: sanitizeString(row.supplierName) || DEFAULT_SUPPLIER_NAME,
    carrier: sanitizeString(row.carrier) || DEFAULT_CARRIER,
    costUsd: toNumber(row.costUsd, 0),
    status: normalizeStatus(row.status),
    shipmentDate: sanitizeString(row.shipmentDate),
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

        if (!row.supplierName) {
          throw new Error(`Supplier not found for supplierId ${row.supplierId}`);
        }
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
  if (row.reference) {
    return row.reference;
  }

  const uploadToken = sanitizeString(metadata.uploadId) || randomUUID().slice(0, 8);
  return `IMP-${uploadToken}-${String(row.rowIndex).padStart(6, "0")}`;
}

function buildShipmentDocument(row, supplier, companyId, settings, metadata) {
  const now = new Date();
  const shipmentDate = row.shipmentDate ? new Date(row.shipmentDate) : now;
  const reference = buildShipmentReference(row, metadata);
  const baseDocument = {
    companyId,
    supplierId: supplier.id,
    reference,
    origin: row.origin || DEFAULT_ORIGIN,
    destination: row.destination,
    distanceKm: Number(row.distanceKm || 0),
    transportMode: row.transportMode,
    carrier: row.carrier || DEFAULT_CARRIER,
    vehicleType: row.vehicleType || null,
    fuelType: row.fuelType || null,
    weightKg: Number(row.weightKg),
    costUsd: Number(row.costUsd || 0),
    carbonPricePerTon: Number(settings.carbonPricePerTon || 0),
    status: row.status || "IN_TRANSIT",
    shipmentDate,
    distanceSource: Number(row.distanceKm || 0) > 0 ? "MANUAL" : "ESTIMATED",
    notes: row.notes || null,
    metadata: {
      importSource: metadata.source,
      importFileName: metadata.fileName || null,
      importUploadId: metadata.uploadId || null,
      importBatchIndex: metadata.batchIndex,
      importRowIndex: row.rowIndex,
      importTemplateName: metadata.templateName || null,
    },
  };
  const calculatedFields = ShipmentService.calculateFields(baseDocument, settings.emissionFactorOverrides || {});

  return {
    ...baseDocument,
    emissionsTonnes: calculatedFields.emissionsTonnes,
    carbonCostUsd: calculatedFields.carbonCostUsd,
  };
}

async function buildPersistableRows(rows, companyId, settings, metadata) {
  const supplierResolver = await buildSupplierResolver(companyId, rows);
  const persistableRows = [];
  const errors = [];

  for (const row of rows) {
    try {
      const supplier = await supplierResolver.resolve(row);
      const shipmentDocument = buildShipmentDocument(row, supplier, companyId, settings, metadata);
      persistableRows.push({
        rowIndex: row.rowIndex,
        reference: shipmentDocument.reference,
        document: shipmentDocument,
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

async function executeBulkUpserts(companyId, rows) {
  const errors = [];
  let successful = 0;
  let inserted = 0;
  let updated = 0;

  for (let startIndex = 0; startIndex < rows.length; startIndex += IMPORT_BATCH_SIZE) {
    const chunk = rows.slice(startIndex, startIndex + IMPORT_BATCH_SIZE);
    const references = chunk.map((item) => item.reference);
    const existingShipments = await Shipment.find({
      companyId,
      reference: { $in: references },
    }).select("reference");
    const existingReferences = new Set(existingShipments.map((shipment) => shipment.reference));
    const now = new Date();
    const operations = chunk.map((item) => ({
      updateOne: {
        filter: {
          companyId,
          reference: item.reference,
        },
        update: {
          $set: {
            ...item.document,
            updatedAt: now,
          },
          $setOnInsert: {
            _id: randomUUID(),
            createdAt: now,
          },
        },
        upsert: true,
      },
    }));

    let writeErrors = [];

    try {
      await Shipment.bulkWrite(operations, { ordered: false });
    } catch (error) {
      writeErrors = Array.isArray(error.writeErrors) ? error.writeErrors : [];
      writeErrors.forEach((writeError) => {
        const chunkRow = chunk[Number(writeError.index)];
        errors.push(buildValidationError(
          chunkRow?.rowIndex || -1,
          "row",
          sanitizeBulkErrorMessage(writeError.errmsg || writeError.message || "Bulk write failed"),
          chunkRow?.reference,
        ));
      });

      if (writeErrors.length === 0) {
        throw error;
      }
    }

    const failedIndexes = new Set(writeErrors.map((writeError) => Number(writeError.index)));
    successful += chunk.length - failedIndexes.size;
    inserted += chunk.filter((row, index) => !failedIndexes.has(index) && !existingReferences.has(row.reference)).length;
    updated += chunk.filter((row, index) => !failedIndexes.has(index) && existingReferences.has(row.reference)).length;
  }

  return {
    successful,
    inserted,
    updated,
    errors,
  };
}

class ImportService {
  static async importShipments(payload, companyId) {
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
    const bulkResult = await executeBulkUpserts(companyId, persistableRows);
    const allErrors = [...validationErrors, ...supplierErrors, ...bulkResult.errors]
      .sort((leftError, rightError) => leftError.rowIndex - rightError.rowIndex);
    const totalRows = shipments.length;
    const successful = bulkResult.successful;
    const failed = new Set(allErrors.map((error) => error.rowIndex)).size;

    return {
      summary: {
        total: totalRows,
        successful,
        ["\u0938\u092B\u0932"]: successful,
        failed,
        inserted: bulkResult.inserted,
        updated: bulkResult.updated,
      },
      errors: allErrors,
      metadata: {
        ...metadata,
        processedRows: totalRows,
      },
    };
  }
}

module.exports = ImportService;
