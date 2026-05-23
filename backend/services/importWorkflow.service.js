const { randomUUID } = require("crypto");
const { AuditLog } = require("../models");
const AuditService = require("./audit.service");
const EmissionImportService = require("./emissionImport.service");
const EmissionFactorService = require("./emissionFactor.service");
const ImportService = require("./import.service");
const ApiError = require("../utils/ApiError");

const MAX_CSV_BYTES = 750 * 1024;

function assertCsvSize(csv = "") {
  if (Buffer.byteLength(String(csv || ""), "utf8") > MAX_CSV_BYTES) {
    throw new ApiError(413, "CSV file is too large. Limit uploads to 750KB.");
  }
}

function parseCsvLine(line = "") {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsv(csv = "") {
  const lines = String(csv || "").split(/\r?\n/).filter((line) => line.trim());
  const headers = parseCsvLine(lines[0] || "");
  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    return {
      rowNumber: index + 2,
      row: headers.reduce((item, header, valueIndex) => {
        item[header] = values[valueIndex] || "";
        return item;
      }, {}),
    };
  });
}

function normalizeImportLog(log = {}) {
  const details = log.details || log.metadata || {};
  return {
    id: log._id || log.id,
    importType: details.importType || details.type || log.entityType || "unknown",
    fileName: details.fileName || "CSV upload",
    status: details.status || (log.status === "failed" ? "failed" : log.action?.includes("preview") ? "previewed" : "committed"),
    totalRows: Number(details.totalRows || 0),
    validRows: Number(details.validRows || 0),
    invalidRows: Number(details.invalidRows || 0),
    createdRecords: Number(details.createdRecords || details.createdCount || 0),
    uploadedBy: log.userEmail || log.userId || null,
    uploadedAt: log.createdAt,
    errors: details.errors || [],
  };
}

function shipmentTemplate() {
  return "reference,origin,destination,weightKg,distanceKm,transportMode,fuelType,supplierName,carrier,costUsd,status,shipmentDate,vehicleType,notes\nSHP-1001,New York,Chicago,1000,1200,ROAD,DIESEL,Acme Fuels,Carrier,1200,PLANNED,2026-05-15,Truck,";
}

function activityTemplate() {
  return EmissionImportService.getTemplate();
}

function factorTemplate() {
  return "scope,category,activityType,factorKey,activityUnit,factorValue,factorUnit,sourceName,sourceYear,sourceUrl,country,region,version,effectiveFrom,effectiveTo,isOfficial,isCustom\n1,Stationary combustion,stationary_fuel,DIESEL,liter,2.68,kgCO2e/liter,Custom verified source,2025,,GLOBAL,GLOBAL,v1,,,false,true";
}

class ImportWorkflowService {
  static async list(companyId, query = {}) {
    const filter = {
      companyId,
      action: { $in: ["import_previewed", "import_committed", "import_failed", "csv_import_previewed", "csv_import_committed", "emission_factor_imported"] },
    };
    if (query.type) filter.$or = [{ "details.importType": query.type }, { "metadata.importType": query.type }];
    const pageSize = Math.min(Math.max(Number(query.pageSize || 25), 1), 100);
    const page = Math.max(Number(query.page || 1), 1);
    const [rows, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      AuditLog.countDocuments(filter),
    ]);
    return {
      data: rows.map(normalizeImportLog),
      pagination: { page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1) },
    };
  }

  static async get(companyId, id) {
    const log = await AuditLog.findOne({ _id: id, companyId }).lean();
    if (!log) throw new ApiError(404, "Import history item not found.");
    return normalizeImportLog(log);
  }

  static getTemplate(type) {
    const normalized = String(type || "").trim();
    if (normalized === "shipment") return shipmentTemplate();
    if (normalized === "emission_activity") return activityTemplate();
    if (normalized === "emission_factor") return factorTemplate();
    return "";
  }

  static async preview(type, csv, companyId, actor = null, meta = {}) {
    assertCsvSize(csv);
    let result;
    const normalized = String(type || "").trim();
    if (normalized === "emission_activity") result = await EmissionImportService.preview(csv, companyId);
    else if (normalized === "emission_factor") result = await EmissionFactorService.previewImport(csv, { ...actor, companyId });
    else if (normalized === "shipment") {
      const rows = parseCsv(csv);
      const previewRows = rows.map(({ rowNumber, row }) => {
        const errors = [];
        if (!row.destination) errors.push("destination is required");
        if (!Number.isFinite(Number(row.weightKg)) || Number(row.weightKg) <= 0) errors.push("weightKg must be greater than 0");
        return { rowNumber, valid: errors.length === 0, errors, warnings: [], payload: row };
      });
      result = {
        totalRows: previewRows.length,
        validRows: previewRows.filter((row) => row.valid).length,
        invalidRows: previewRows.filter((row) => !row.valid).length,
        duplicateWarnings: 0,
        rows: previewRows,
        validRowItems: previewRows.filter((row) => row.valid),
        invalidRowItems: previewRows.filter((row) => !row.valid),
      };
    } else {
      throw new ApiError(422, "Unsupported import type.");
    }

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "import_previewed",
      entityType: "Import",
      entityId: randomUUID(),
      details: {
        importType: normalized,
        fileName: meta.fileName || "CSV upload",
        status: "previewed",
        totalRows: result.totalRows,
        validRows: result.validRows,
        invalidRows: result.invalidRows,
      },
    });
    return result;
  }

  static async commit(type, csv, companyId, actor = null, meta = {}) {
    assertCsvSize(csv);
    const normalized = String(type || "").trim();
    let result;
    try {
      if (normalized === "emission_activity") result = await EmissionImportService.commit(csv, companyId, actor);
      else if (normalized === "emission_factor") result = await EmissionFactorService.commitImport(csv, { ...actor, companyId });
      else if (normalized === "shipment") {
        const rows = parseCsv(csv).map(({ rowNumber, row }) => ({ rowIndex: rowNumber, ...row }));
        result = await ImportService.importShipments({
          shipments: rows,
          metadata: { source: "csv", fileName: meta.fileName || "CSV upload", uploadId: randomUUID() },
        }, companyId);
        result = {
          ...result,
          totalRows: result.summary.total,
          validRows: result.summary.successful,
          invalidRows: result.summary.failed,
          createdCount: result.summary.inserted,
          rows: [],
        };
      } else {
        throw new ApiError(422, "Unsupported import type.");
      }
      await AuditService.log({
        companyId,
        userId: actor?.id || null,
        userEmail: actor?.email || null,
        action: "import_committed",
        entityType: "Import",
        entityId: randomUUID(),
        details: {
          importType: normalized,
          fileName: meta.fileName || "CSV upload",
          status: result.invalidRows ? "partially_failed" : "committed",
          totalRows: result.totalRows,
          validRows: result.validRows,
          invalidRows: result.invalidRows,
          createdRecords: result.createdCount || result.createdRecords?.length || result.summary?.inserted || 0,
        },
      });
      return result;
    } catch (error) {
      await AuditService.log({
        companyId,
        userId: actor?.id || null,
        userEmail: actor?.email || null,
        action: "import_failed",
        entityType: "Import",
        entityId: randomUUID(),
        status: "failed",
        details: { importType: normalized, fileName: meta.fileName || "CSV upload", status: "failed", error: error.message },
      });
      throw error;
    }
  }
}

module.exports = ImportWorkflowService;
