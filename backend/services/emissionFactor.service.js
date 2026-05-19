const { EmissionFactor } = require("../models");
const AuditService = require("./audit.service");

function normalizeFactorPayload(payload = {}, actor = null) {
  const activityUnit = String(payload.activityUnit || payload.unit || "").trim();
  const factorValue = Number(payload.factorValue ?? payload.value);

  return {
    companyId: payload.companyId ? String(payload.companyId).trim() : null,
    name: String(payload.name || "").trim(),
    scope: Number(payload.scope),
    category: String(payload.category || "").trim(),
    activityType: String(payload.activityType || "").trim().toLowerCase(),
    factorKey: payload.factorKey || payload.fuelType
      ? String(payload.factorKey || payload.fuelType).trim().replace(/[\s-]+/g, "_").toUpperCase()
      : null,
    activityUnit,
    factorValue,
    value: factorValue,
    unit: activityUnit,
    factorUnit: String(payload.factorUnit || `kgCO2e/${activityUnit || "unit"}`).trim(),
    source: String(payload.source || payload.sourceName || "").trim(),
    sourceName: String(payload.sourceName || payload.source || "").trim(),
    sourceYear: Number(payload.sourceYear),
    country: payload.country ? String(payload.country).trim().toUpperCase() : null,
    region: String(payload.region || "GLOBAL").trim().toUpperCase(),
    version: String(payload.version || "v1").trim(),
    effectiveFrom: payload.effectiveFrom ? new Date(payload.effectiveFrom) : null,
    effectiveTo: payload.effectiveTo ? new Date(payload.effectiveTo) : null,
    isSample: Boolean(payload.isSample),
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
    updatedBy: actor?.id || null,
  };
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeGeo(value) {
  return String(value || "").trim().toUpperCase();
}

function parseVersionNumber(value) {
  const numbers = String(value || "")
    .match(/\d+(\.\d+)?/g);

  if (!numbers || numbers.length === 0) {
    return 0;
  }

  return Number(numbers.join("."));
}

function isOfficialOrCustomFactor(factor = {}) {
  return factor.isSample === false
    && Boolean(String(factor.sourceName || factor.source || "").trim())
    && Number.isInteger(Number(factor.sourceYear));
}

function scoreFactor(factor = {}, criteria = {}) {
  const companyId = String(criteria.companyId || "").trim();
  const country = normalizeGeo(criteria.country);
  const region = normalizeGeo(criteria.region || "GLOBAL");
  const factorKey = normalizeGeo(criteria.factorKey || criteria.fuelType);
  const factorCompanyId = String(factor.companyId || "").trim();
  const factorCountry = normalizeGeo(factor.country);
  const factorRegion = normalizeGeo(factor.region || "GLOBAL");
  const candidateFactorKey = normalizeGeo(factor.factorKey || factor.key);

  let score = 0;
  if (companyId && factorCompanyId === companyId) score += 1000;
  if (!factorCompanyId) score += 100;
  if (factorKey && candidateFactorKey === factorKey) score += 120;
  if (country && factorCountry === country) score += 80;
  if (!country && factorCountry) score += 5;
  if (region && factorRegion === region) score += 40;
  if (factorRegion === "GLOBAL") score += 10;
  if (isOfficialOrCustomFactor(factor)) score += 5;
  score += Math.min(Number(factor.sourceYear || 0) / 10000, 1);
  score += Math.min(parseVersionNumber(factor.version) / 1000, 1);
  return score;
}

function selectBestMatchingFactor(factors = [], criteria = {}) {
  const asOfDate = new Date(criteria.occurredAt || criteria.asOfDate || Date.now());
  const scope = Number(criteria.scope);
  const category = normalizeText(criteria.category);
  const activityType = normalizeText(criteria.activityType);
  const factorKey = normalizeGeo(criteria.factorKey || criteria.fuelType);
  const activityUnit = normalizeText(criteria.activityUnit || criteria.unit);

  const eligible = factors.filter((factor) => {
    const effectiveFrom = factor.effectiveFrom ? new Date(factor.effectiveFrom) : null;
    const effectiveTo = factor.effectiveTo ? new Date(factor.effectiveTo) : null;
    const factorUnit = normalizeText(factor.activityUnit || factor.unit);
    const candidateFactorKey = normalizeGeo(factor.factorKey || factor.key);
    return factor.isActive !== false
      && Number(factor.scope) === scope
      && normalizeText(factor.category) === category
      && normalizeText(factor.activityType) === activityType
      && (!factorKey || !candidateFactorKey || candidateFactorKey === factorKey)
      && factorUnit === activityUnit
      && (!effectiveFrom || effectiveFrom <= asOfDate)
      && (!effectiveTo || effectiveTo >= asOfDate);
  });

  if (eligible.length === 0) {
    return null;
  }

  return eligible
    .map((factor) => ({ factor, score: scoreFactor(factor, criteria) }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (Number(right.factor.sourceYear || 0) !== Number(left.factor.sourceYear || 0)) {
        return Number(right.factor.sourceYear || 0) - Number(left.factor.sourceYear || 0);
      }
      return parseVersionNumber(right.factor.version) - parseVersionNumber(left.factor.version);
    })[0].factor;
}

function validateFactorPayload(payload = {}) {
  const errors = [];
  const normalized = normalizeFactorPayload(payload);

  if (!normalized.name) errors.push("name is required");
  if (![1, 2, 3].includes(normalized.scope)) errors.push("scope must be 1, 2, or 3");
  if (!normalized.category) errors.push("category is required");
  if (!normalized.activityType) errors.push("activityType is required");
  if (!normalized.activityUnit) errors.push("activityUnit is required");
  if (!Number.isFinite(normalized.factorValue) || normalized.factorValue < 0) errors.push("factorValue must be a non-negative number");
  if (!normalized.factorUnit) errors.push("factorUnit is required");
  if (!normalized.sourceName) errors.push("sourceName is required");
  if (!Number.isInteger(normalized.sourceYear) || normalized.sourceYear < 1900) errors.push("sourceYear must be a valid year");
  if (normalized.effectiveFrom && Number.isNaN(normalized.effectiveFrom.getTime())) errors.push("effectiveFrom must be a valid date");
  if (normalized.effectiveTo && Number.isNaN(normalized.effectiveTo.getTime())) errors.push("effectiveTo must be a valid date");
  if (normalized.effectiveFrom && normalized.effectiveTo && normalized.effectiveTo < normalized.effectiveFrom) {
    errors.push("effectiveTo must be after effectiveFrom");
  }

  if (errors.length) {
    const error = new Error(errors.join("; "));
    error.status = 422;
    throw error;
  }

  return normalized;
}

class EmissionFactorService {
  static async resolveBestMatch(criteria = {}) {
    const scope = Number(criteria.scope);
    const category = String(criteria.category || "").trim();
    const activityType = String(criteria.activityType || "").trim().toLowerCase();
    const factorKey = criteria.factorKey || criteria.fuelType
      ? String(criteria.factorKey || criteria.fuelType).trim().replace(/[\s-]+/g, "_").toUpperCase()
      : null;
    const activityUnit = String(criteria.activityUnit || criteria.unit || "").trim();
    const companyId = criteria.companyId ? String(criteria.companyId).trim() : null;
    const asOfDate = new Date(criteria.occurredAt || criteria.asOfDate || Date.now());

    if (![1, 2, 3].includes(scope) || !category || !activityType || !activityUnit) {
      return null;
    }

    const filter = {
      isActive: true,
      scope,
      category: { $regex: `^${escapeRegex(category)}$`, $options: "i" },
      activityType,
      $or: [
        { activityUnit },
        { unit: activityUnit },
      ],
      $and: [
        { $or: [{ companyId }, { companyId: null }, { companyId: "" }] },
        { $or: [{ factorKey }, { factorKey: null }, { factorKey: "" }, { factorKey: { $exists: false } }] },
        { $or: [{ effectiveFrom: null }, { effectiveFrom: { $lte: asOfDate } }] },
        { $or: [{ effectiveTo: null }, { effectiveTo: { $gte: asOfDate } }] },
      ],
    };

    const candidates = await EmissionFactor.find(filter).lean();
    return selectBestMatchingFactor(candidates, criteria);
  }

  static async list(query = {}) {
    const filter = {};
    if (query.scope) filter.scope = Number(query.scope);
    if (query.category) filter.category = { $regex: query.category, $options: "i" };
    if (query.factorKey) filter.factorKey = String(query.factorKey).toUpperCase();
    if (query.source || query.sourceName) filter.sourceName = { $regex: query.source || query.sourceName, $options: "i" };
    if (query.sourceYear) filter.sourceYear = Number(query.sourceYear);
    if (query.country) filter.country = String(query.country).toUpperCase();
    if (query.companyId) filter.companyId = query.companyId;
    if (query.region) filter.region = String(query.region).toUpperCase();
    if (query.isSample !== undefined) filter.isSample = String(query.isSample) === "true";
    if (query.isActive !== undefined) filter.isActive = String(query.isActive) === "true";
    if (query.search) {
      filter.$or = ["name", "category", "activityType", "factorKey", "sourceName"].map((field) => ({
        [field]: { $regex: String(query.search), $options: "i" },
      }));
    }

    const pageSize = Math.min(Math.max(Number(query.pageSize || 50), 1), 100);
    const page = Math.max(Number(query.page || 1), 1);
    const [data, total] = await Promise.all([
      EmissionFactor.find(filter).sort({ isActive: -1, scope: 1, category: 1, sourceYear: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      EmissionFactor.countDocuments(filter),
    ]);

    return {
      data: data.map((factor) => ({ id: factor._id, ...factor })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  }

  static async create(payload, actor = null) {
    const normalized = validateFactorPayload(payload);
    const factor = await EmissionFactor.create({
      ...normalized,
      createdBy: actor?.id || null,
    });
    await AuditService.log({
      companyId: normalized.companyId || actor?.companyId || null,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "emission_factor_created",
      entityType: "EmissionFactor",
      entityId: factor.id,
      ipAddress: actor?.ipAddress || null,
      userAgent: actor?.userAgent || null,
      newValue: factor.toObject(),
    });
    return factor;
  }

  static async update(id, payload, actor = null) {
    const factor = await EmissionFactor.findById(id);
    if (!factor) {
      const error = new Error("Emission factor not found");
      error.status = 404;
      throw error;
    }

    const oldValue = factor.toObject();
    const normalized = validateFactorPayload({
      ...oldValue,
      ...payload,
      activityUnit: payload.activityUnit ?? oldValue.activityUnit ?? oldValue.unit,
      factorValue: payload.factorValue ?? oldValue.factorValue ?? oldValue.value,
      sourceName: payload.sourceName ?? oldValue.sourceName ?? oldValue.source,
    });
    Object.assign(factor, normalized);
    await factor.save();

    await AuditService.log({
      companyId: factor.companyId || actor?.companyId || null,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "emission_factor_updated",
      entityType: "EmissionFactor",
      entityId: factor.id,
      ipAddress: actor?.ipAddress || null,
      userAgent: actor?.userAgent || null,
      oldValue,
      newValue: factor.toObject(),
    });
    return factor;
  }

  static async deactivate(id, actor = null) {
    const factor = await EmissionFactor.findById(id);
    if (!factor) {
      const error = new Error("Emission factor not found");
      error.status = 404;
      throw error;
    }

    const oldValue = factor.toObject();
    factor.isActive = false;
    factor.updatedBy = actor?.id || null;
    await factor.save();
    await AuditService.log({
      companyId: factor.companyId || actor?.companyId || null,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "emission_factor_deactivated",
      entityType: "EmissionFactor",
      entityId: factor.id,
      ipAddress: actor?.ipAddress || null,
      userAgent: actor?.userAgent || null,
      oldValue,
      newValue: factor.toObject(),
    });
    return factor;
  }
}

module.exports = EmissionFactorService;
module.exports.validateFactorPayload = validateFactorPayload;
module.exports.isOfficialOrCustomFactor = isOfficialOrCustomFactor;
module.exports.selectBestMatchingFactor = selectBestMatchingFactor;
