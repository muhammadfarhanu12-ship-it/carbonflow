const { SupplierBenchmark } = require("../models");
const AuditService = require("./audit.service");

function normalizeText(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizeGeo(value, fallback = "GLOBAL") {
  const normalized = normalizeText(value, fallback).toUpperCase();
  return normalized || fallback;
}

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "official"].includes(String(value).trim().toLowerCase());
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseCsv(csv = "") {
  const lines = String(csv || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    return headers.reduce((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

function normalizeBenchmarkPayload(payload = {}, actor = null) {
  const normalized = {
    category: normalizeText(payload.category),
    region: normalizeGeo(payload.region),
    country: payload.country ? normalizeGeo(payload.country, "") : null,
    industryCode: normalizeText(payload.industryCode, null),
    averageIntensity: toNumber(payload.averageIntensity),
    medianIntensity: toNumber(payload.medianIntensity),
    percentile25: toNumber(payload.percentile25),
    percentile75: toNumber(payload.percentile75),
    sourceName: normalizeText(payload.sourceName),
    sourceYear: toNumber(payload.sourceYear),
    version: normalizeText(payload.version, "v1"),
    isOfficial: parseBoolean(payload.isOfficial, false),
    isSample: parseBoolean(payload.isSample, true),
    isActive: payload.isActive === undefined ? true : parseBoolean(payload.isActive, true),
    provider: normalizeText(payload.provider, "uploaded_csv"),
    effectiveFrom: parseDate(payload.effectiveFrom),
    effectiveTo: parseDate(payload.effectiveTo),
    updatedBy: actor?.id || null,
  };

  const errors = [];
  if (!normalized.category) errors.push("category is required");
  if (!Number.isFinite(normalized.averageIntensity) || normalized.averageIntensity < 0) errors.push("averageIntensity must be a non-negative number");
  if (!normalized.sourceName) errors.push("sourceName is required");
  if (!Number.isInteger(normalized.sourceYear) || normalized.sourceYear < 1900) errors.push("sourceYear must be a valid year");
  if (normalized.effectiveFrom && normalized.effectiveTo && normalized.effectiveTo < normalized.effectiveFrom) {
    errors.push("effectiveTo must be after effectiveFrom");
  }
  if (!["uploaded_csv", "external", "manual"].includes(normalized.provider)) {
    errors.push("provider must be uploaded_csv, external, or manual");
  }

  if (errors.length) {
    const error = new Error(errors.join("; "));
    error.status = 422;
    throw error;
  }

  return normalized;
}

function toBenchmarkView(row = {}) {
  return {
    id: row._id || row.id,
    category: row.category,
    region: row.region,
    country: row.country || null,
    industryCode: row.industryCode || null,
    averageIntensity: row.averageIntensity,
    medianIntensity: row.medianIntensity ?? null,
    percentile25: row.percentile25 ?? null,
    percentile75: row.percentile75 ?? null,
    sourceName: row.sourceName,
    sourceYear: row.sourceYear,
    version: row.version,
    isOfficial: Boolean(row.isOfficial),
    isSample: Boolean(row.isSample),
    isActive: row.isActive !== false,
    provider: row.provider || "uploaded_csv",
    effectiveFrom: row.effectiveFrom || null,
    effectiveTo: row.effectiveTo || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function buildFilter(query = {}) {
  const filter = {};
  if (query.category) filter.category = { $regex: String(query.category), $options: "i" };
  if (query.region) filter.region = normalizeGeo(query.region);
  if (query.country) filter.country = normalizeGeo(query.country, "");
  if (query.industryCode) filter.industryCode = String(query.industryCode).trim();
  if (query.source || query.sourceName) filter.sourceName = { $regex: String(query.source || query.sourceName), $options: "i" };
  if (query.sourceYear) filter.sourceYear = Number(query.sourceYear);
  if (query.isSample !== undefined) filter.isSample = String(query.isSample) === "true";
  if (query.isOfficial !== undefined) filter.isOfficial = String(query.isOfficial) === "true";
  if (query.isActive !== undefined) filter.isActive = String(query.isActive) === "true";
  if (query.search) {
    filter.$or = ["category", "region", "country", "industryCode", "sourceName", "version"].map((field) => ({
      [field]: { $regex: String(query.search), $options: "i" },
    }));
  }
  return filter;
}

class SupplierBenchmarkDatasetService {
  static async list(query = {}) {
    const filter = buildFilter(query);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 50), 1), 100);
    const page = Math.max(Number(query.page || 1), 1);
    const [data, total] = await Promise.all([
      SupplierBenchmark.find(filter).sort({ isActive: -1, sourceYear: -1, category: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      SupplierBenchmark.countDocuments(filter),
    ]);

    return {
      data: data.map(toBenchmarkView),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  }

  static async findBestMatch(criteria = {}) {
    const asOfDate = new Date(criteria.asOfDate || Date.now());
    const filter = {
      isActive: true,
      category: { $regex: `^${normalizeText(criteria.category).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      $and: [
        { $or: [{ country: normalizeGeo(criteria.country, "") }, { country: null }, { country: "" }] },
        { $or: [{ region: normalizeGeo(criteria.region) }, { region: "GLOBAL" }, { region: null }, { region: "" }] },
        { $or: [{ industryCode: normalizeText(criteria.industryCode, "") }, { industryCode: null }, { industryCode: "" }] },
        { $or: [{ effectiveFrom: null }, { effectiveFrom: { $lte: asOfDate } }] },
        { $or: [{ effectiveTo: null }, { effectiveTo: { $gte: asOfDate } }] },
      ],
    };
    const candidates = await SupplierBenchmark.find(filter).lean();
    if (!candidates.length) return null;

    const country = normalizeGeo(criteria.country, "");
    const region = normalizeGeo(criteria.region);
    const industryCode = normalizeText(criteria.industryCode, "");
    return candidates
      .map((row) => {
        let score = 0;
        if (country && row.country === country) score += 100;
        if (region && row.region === region) score += 50;
        if (row.region === "GLOBAL") score += 5;
        if (industryCode && row.industryCode === industryCode) score += 30;
        if (row.isOfficial) score += 10;
        if (!row.isSample) score += 5;
        score += Number(row.sourceYear || 0) / 10000;
        return { row, score };
      })
      .sort((left, right) => right.score - left.score)[0].row;
  }

  static async create(payload, actor = null) {
    const normalized = normalizeBenchmarkPayload(payload, actor);
    const row = await SupplierBenchmark.create({
      ...normalized,
      createdBy: actor?.id || null,
    });
    await AuditService.log({
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "supplier_benchmark_created",
      entityType: "SupplierBenchmark",
      entityId: row.id,
      newValue: row.toObject(),
    });
    return toBenchmarkView(row);
  }

  static async uploadCsv(csv, actor = null) {
    const rows = parseCsv(csv).map((row) => normalizeBenchmarkPayload(row, actor));
    if (rows.length === 0) {
      const error = new Error("CSV must include headers and at least one benchmark row.");
      error.status = 422;
      throw error;
    }
    const created = await SupplierBenchmark.insertMany(rows.map((row) => ({ ...row, createdBy: actor?.id || null })));
    await AuditService.log({
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "supplier_benchmark_csv_uploaded",
      entityType: "SupplierBenchmark",
      details: { count: created.length },
    });
    return { created: created.length, data: created.map(toBenchmarkView) };
  }

  static async deactivate(id, actor = null) {
    const row = await SupplierBenchmark.findById(id);
    if (!row) {
      const error = new Error("Supplier benchmark not found");
      error.status = 404;
      throw error;
    }
    const oldValue = row.toObject();
    row.isActive = false;
    row.updatedBy = actor?.id || null;
    await row.save();
    await AuditService.log({
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "supplier_benchmark_deactivated",
      entityType: "SupplierBenchmark",
      entityId: row.id,
      oldValue,
      newValue: row.toObject(),
    });
    return toBenchmarkView(row);
  }
}

module.exports = SupplierBenchmarkDatasetService;
module.exports.normalizeBenchmarkPayload = normalizeBenchmarkPayload;
module.exports.parseCsv = parseCsv;
