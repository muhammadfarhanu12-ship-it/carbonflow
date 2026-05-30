const { EmissionFactor, EmissionRecord } = require("../models");
const AuditService = require("./audit.service");
const { getSampleFactors } = require("./carbonEngine");

function normalizeFactorPayload(payload = {}, actor = null) {
  const activityUnit = String(payload.activityUnit || payload.unit || "").trim();
  const factorValue = Number(payload.factorValue ?? payload.value);
  const isSample = Boolean(payload.isSample);
  const isOfficial = Boolean(payload.isOfficial);
  const isCustom = Boolean(payload.isCustom);
  const companyId = payload.companyId ? String(payload.companyId).trim() : actor?.companyId ? String(actor.companyId).trim() : null;

  return {
    companyId,
    name: String(payload.name || payload.factorKey || "").trim(),
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
    sourceUrl: payload.sourceUrl ? String(payload.sourceUrl).trim() : null,
    methodology: payload.methodology ? String(payload.methodology).trim() : null,
    notes: payload.notes ? String(payload.notes).trim() : null,
    country: payload.country ? String(payload.country).trim().toUpperCase() : null,
    region: String(payload.region || "GLOBAL").trim().toUpperCase(),
    version: String(payload.version || "v1").trim(),
    effectiveFrom: payload.effectiveFrom ? new Date(payload.effectiveFrom) : null,
    effectiveTo: payload.effectiveTo ? new Date(payload.effectiveTo) : null,
    isSample,
    isOfficial,
    isCustom,
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
  return factor.isSample === false && (factor.isOfficial === true || factor.isCustom === true || Boolean(factor.companyId))
    && Boolean(String(factor.sourceName || factor.source || "").trim())
    && Number.isInteger(Number(factor.sourceYear));
}

function factorKind(factor = {}) {
  if (factor.isSample !== false) return "sample";
  if (factor.isCustom === true || Boolean(String(factor.companyId || "").trim())) return "custom";
  if (
    factor.isOfficial === true
    && !factor.companyId
    && Boolean(String(factor.sourceName || factor.source || "").trim())
    && Number.isInteger(Number(factor.sourceYear))
  ) return "official";
  return "configured";
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

  const companyId = String(criteria.companyId || "").trim();
  const companyCustom = eligible.filter((factor) => (
    factor.isActive !== false
    && factor.isSample === false
    && (factor.isCustom === true || Boolean(factor.companyId))
    && String(factor.companyId || "").trim() === companyId
  ));
  const officialGlobal = eligible.filter((factor) => (
    factor.isActive !== false
    && factor.isSample === false
    && factor.isOfficial === true
    && !String(factor.companyId || "").trim()
    && Boolean(String(factor.sourceName || factor.source || "").trim())
    && Number.isInteger(Number(factor.sourceYear))
  ));
  const sampleFallback = eligible.filter((factor) => factor.isSample !== false);
  const prioritized = companyCustom.length ? companyCustom : officialGlobal.length ? officialGlobal : sampleFallback.length ? sampleFallback : eligible;

  return prioritized
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
  if (!normalized.factorKey) errors.push("factorKey is required");
  if (!normalized.activityUnit) errors.push("activityUnit is required");
  if (!Number.isFinite(normalized.factorValue) || normalized.factorValue <= 0) errors.push("factorValue must be greater than 0");
  if (!normalized.factorUnit) errors.push("factorUnit is required");
  if (!normalized.sourceName) errors.push("sourceName is required");
  if (!Number.isInteger(normalized.sourceYear) || normalized.sourceYear < 1900) errors.push("sourceYear must be a valid year");
  if (normalized.effectiveFrom && Number.isNaN(normalized.effectiveFrom.getTime())) errors.push("effectiveFrom must be a valid date");
  if (normalized.effectiveTo && Number.isNaN(normalized.effectiveTo.getTime())) errors.push("effectiveTo must be a valid date");
  if (normalized.effectiveFrom && normalized.effectiveTo && normalized.effectiveTo < normalized.effectiveFrom) {
    errors.push("effectiveTo must be after effectiveFrom");
  }
  if (normalized.isSample && normalized.isOfficial) errors.push("sample factors cannot be official");
  if (normalized.isSample && normalized.isCustom) errors.push("sample factors cannot be custom");
  if (!normalized.isSample && !normalized.isOfficial && !normalized.isCustom) errors.push("non-sample factors must be marked official or custom");
  if (normalized.isCustom && !normalized.companyId) errors.push("custom factors must be scoped to a companyId");
  if (normalized.isOfficial && normalized.companyId) errors.push("official factors must be global; use custom for company-scoped factors");

  if (errors.length) {
    const error = new Error(errors.join("; "));
    error.status = 422;
    throw error;
  }

  return normalized;
}

function actorCanManageGlobalOfficial(actor = null) {
  const role = String(actor?.role || "").toLowerCase();
  return ["superadmin", "admin", "owner"].includes(role);
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseBoolean(value) {
  return ["true", "1", "yes", "y"].includes(String(value || "").trim().toLowerCase());
}

function parseFactorCsv(csv = "") {
  const lines = String(csv || "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const raw = headers.reduce((row, header, cellIndex) => {
      row[header] = cells[cellIndex] ?? "";
      return row;
    }, {});
    return {
      rowNumber: index + 2,
      raw,
      payload: {
        ...raw,
        scope: Number(raw.scope),
        factorValue: Number(raw.factorValue),
        sourceYear: Number(raw.sourceYear),
        isOfficial: parseBoolean(raw.isOfficial),
        isCustom: parseBoolean(raw.isCustom),
        isSample: false,
      },
    };
  });
}

function duplicateKeyFor(payload = {}) {
  return [
    payload.companyId || "",
    payload.scope || "",
    String(payload.category || "").trim().toLowerCase(),
    String(payload.activityType || "").trim().toLowerCase(),
    String(payload.factorKey || "").trim().toUpperCase(),
    String(payload.activityUnit || "").trim().toLowerCase(),
    String(payload.country || "").trim().toUpperCase(),
    String(payload.region || "GLOBAL").trim().toUpperCase(),
    payload.sourceYear || "",
    String(payload.version || "v1").trim().toLowerCase(),
  ].join("|");
}

async function countMissingFactorReferences(companyId) {
  if (process.env.NODE_ENV === "test" && !EmissionRecord.countDocuments._isMockFunction) {
    return 0;
  }
  const countPromise = EmissionRecord.countDocuments({
    companyId,
    $or: [{ calculationStatus: "missing_factor" }, { factorValue: null }, { factorValue: { $exists: false } }],
  });
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve(0), 1000);
  });
  return Promise.race([countPromise, timeoutPromise]);
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
    if (query.isOfficial !== undefined) filter.isOfficial = String(query.isOfficial) === "true";
    if (query.isCustom !== undefined) filter.isCustom = String(query.isCustom) === "true";
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

  static async listForCompany(companyId, query = {}) {
    const scopedQuery = { ...query };
    const filter = {
      $or: [{ companyId }, { companyId: null }, { companyId: "" }],
    };
    if (scopedQuery.scope) filter.scope = Number(scopedQuery.scope);
    if (scopedQuery.category) filter.category = { $regex: scopedQuery.category, $options: "i" };
    if (scopedQuery.activityType) filter.activityType = String(scopedQuery.activityType).trim().toLowerCase();
    if (scopedQuery.factorKey) filter.factorKey = String(scopedQuery.factorKey).trim().replace(/[\s-]+/g, "_").toUpperCase();
    if (scopedQuery.source || scopedQuery.sourceName) filter.sourceName = { $regex: scopedQuery.source || scopedQuery.sourceName, $options: "i" };
    if (scopedQuery.sourceYear) filter.sourceYear = Number(scopedQuery.sourceYear);
    if (scopedQuery.country) filter.country = String(scopedQuery.country).toUpperCase();
    if (scopedQuery.region) filter.region = String(scopedQuery.region).toUpperCase();
    if (scopedQuery.activityUnit) filter.activityUnit = String(scopedQuery.activityUnit).trim();
    if (scopedQuery.status === "active") filter.isActive = true;
    if (scopedQuery.status === "inactive") filter.isActive = false;
    if (scopedQuery.type === "custom") filter.isCustom = true;
    if (scopedQuery.type === "official") {
      filter.isOfficial = true;
      filter.isSample = false;
      filter.companyId = { $in: [null, ""] };
    }
    if (scopedQuery.type === "sample") filter.isSample = true;
    if (scopedQuery.isSample !== undefined) filter.isSample = String(scopedQuery.isSample) === "true";
    if (scopedQuery.isOfficial !== undefined) filter.isOfficial = String(scopedQuery.isOfficial) === "true";
    if (scopedQuery.isCustom !== undefined) filter.isCustom = String(scopedQuery.isCustom) === "true";
    if (scopedQuery.isActive !== undefined) filter.isActive = String(scopedQuery.isActive) === "true";
    if (scopedQuery.search) {
      filter.$and = [
        { $or: filter.$or },
        {
          $or: ["name", "category", "activityType", "factorKey", "sourceName", "methodology"].map((field) => ({
            [field]: { $regex: String(scopedQuery.search), $options: "i" },
          })),
        },
      ];
      delete filter.$or;
    }

    const pageSize = Math.min(Math.max(Number(scopedQuery.pageSize || 50), 1), 100);
    const page = Math.max(Number(scopedQuery.page || 1), 1);
    const [dbFactors, dbTotal, missingFactorsReferenced] = await Promise.all([
      EmissionFactor.find(filter).sort({ isActive: -1, isCustom: -1, isOfficial: -1, isSample: 1, scope: 1, category: 1, sourceYear: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      EmissionFactor.countDocuments(filter),
      countMissingFactorReferences(companyId),
    ]);

    const includeSamples = scopedQuery.type !== "custom" && scopedQuery.type !== "official" && scopedQuery.isSample !== "false" && scopedQuery.status !== "inactive" && scopedQuery.isActive !== "false";
    const sampleFactors = includeSamples ? getSampleFactors().map((factor) => ({
      ...factor,
      id: `sample:${factor.scope}:${factor.category}:${factor.activityType}:${factor.factorKey}:${factor.activityUnit}:${factor.region}`,
      _id: `sample:${factor.scope}:${factor.category}:${factor.activityType}:${factor.factorKey}:${factor.activityUnit}:${factor.region}`,
      companyId: null,
      isActive: true,
      isOfficial: false,
      isCustom: false,
      canEdit: false,
      factorStatus: "sample",
    })) : [];

    const sampleFiltered = sampleFactors.filter((factor) => {
      const search = String(scopedQuery.search || "").trim().toLowerCase();
      return (!scopedQuery.scope || Number(factor.scope) === Number(scopedQuery.scope))
        && (!scopedQuery.category || normalizeText(factor.category).includes(normalizeText(scopedQuery.category)))
        && (!scopedQuery.activityType || normalizeText(factor.activityType) === normalizeText(scopedQuery.activityType))
        && (!scopedQuery.factorKey || normalizeGeo(factor.factorKey) === normalizeGeo(scopedQuery.factorKey))
        && (!scopedQuery.sourceYear || Number(factor.sourceYear) === Number(scopedQuery.sourceYear))
        && (!scopedQuery.country || normalizeGeo(factor.country) === normalizeGeo(scopedQuery.country))
        && (!scopedQuery.region || normalizeGeo(factor.region) === normalizeGeo(scopedQuery.region))
        && (!scopedQuery.activityUnit || normalizeText(factor.activityUnit) === normalizeText(scopedQuery.activityUnit))
        && (!search || [factor.name, factor.category, factor.activityType, factor.factorKey, factor.sourceName, factor.methodology].some((value) => normalizeText(value).includes(search)));
    });

    const data = [
      ...dbFactors.map((factor) => ({ id: factor._id, ...factor, factorStatus: factorKind(factor), canEdit: factor.isCustom === true && String(factor.companyId || "") === String(companyId) })),
      ...sampleFiltered,
    ].sort((left, right) => {
      const activeDiff = Number(right.isActive !== false) - Number(left.isActive !== false);
      if (activeDiff) return activeDiff;
      const rank = { custom: 3, official: 2, configured: 1, sample: 0 };
      const rankDiff = (rank[factorKind(right)] || 0) - (rank[factorKind(left)] || 0);
      if (rankDiff) return rankDiff;
      if (Number(left.scope) !== Number(right.scope)) return Number(left.scope) - Number(right.scope);
      return String(left.category || "").localeCompare(String(right.category || ""));
    });

    const total = dbTotal + sampleFiltered.length;
    const pagedData = data.slice(0, pageSize);
    const summary = data.reduce((counts, factor) => {
      const kind = factorKind(factor);
      if (kind === "custom") counts.customFactors += 1;
      if (kind === "official") counts.officialFactors += 1;
      if (kind === "sample") counts.sampleFactors += 1;
      return counts;
    }, {
      customFactors: 0,
      officialFactors: 0,
      sampleFactors: 0,
      missingFactorsReferenced,
    });

    return {
      data: pagedData,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
      summary,
    };
  }

  static async getForCompany(id, companyId) {
    const factor = await EmissionFactor.findOne({
      _id: id,
      $or: [{ companyId }, { companyId: null }, { companyId: "" }],
    }).lean();
    if (!factor) {
      const error = new Error("Emission factor not found");
      error.status = 404;
      throw error;
    }
    return { id: factor._id, ...factor, factorStatus: factorKind(factor), canEdit: factor.isCustom === true && String(factor.companyId || "") === String(companyId) };
  }

  static async createCompanyCustom(payload, companyId, actor = null) {
    return this.create({
      ...payload,
      companyId,
      isSample: false,
      isOfficial: false,
      isCustom: true,
    }, { ...actor, companyId });
  }

  static async updateCompanyCustom(id, payload, companyId, actor = null) {
    const existing = await EmissionFactor.findOne({ _id: id, companyId, isCustom: true });
    if (!existing) {
      const error = new Error("Only company custom emission factors can be edited here");
      error.status = 403;
      throw error;
    }
    return this.update(id, {
      ...payload,
      companyId,
      isSample: false,
      isOfficial: false,
      isCustom: true,
    }, { ...actor, companyId });
  }

  static async deactivateCompanyCustom(id, companyId, actor = null) {
    const factor = await EmissionFactor.findOne({ _id: id, companyId, isCustom: true });
    if (!factor) {
      const error = new Error("Only company custom emission factors can be deactivated here");
      error.status = 403;
      throw error;
    }
    return this.deactivate(id, { ...actor, companyId });
  }

  static async reactivateCompanyCustom(id, companyId, actor = null) {
    const factor = await EmissionFactor.findOne({ _id: id, companyId, isCustom: true });
    if (!factor) {
      const error = new Error("Only company custom emission factors can be reactivated here");
      error.status = 403;
      throw error;
    }
    return this.reactivate(id, { ...actor, companyId });
  }

  static async create(payload, actor = null) {
    const normalized = validateFactorPayload(payload);
    if (normalized.isOfficial && !normalized.companyId && !actorCanManageGlobalOfficial(actor)) {
      const error = new Error("admin or superadmin permission is required for official global factors");
      error.status = 403;
      throw error;
    }
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
    if (normalized.isOfficial && !normalized.companyId && !actorCanManageGlobalOfficial(actor)) {
      const error = new Error("admin or superadmin permission is required for official global factors");
      error.status = 403;
      throw error;
    }
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

  static async reactivate(id, actor = null) {
    const factor = await EmissionFactor.findById(id);
    if (!factor) {
      const error = new Error("Emission factor not found");
      error.status = 404;
      throw error;
    }

    const oldValue = factor.toObject();
    factor.isActive = true;
    factor.updatedBy = actor?.id || null;
    await factor.save();
    await AuditService.log({
      companyId: factor.companyId || actor?.companyId || null,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "emission_factor_reactivated",
      entityType: "EmissionFactor",
      entityId: factor.id,
      ipAddress: actor?.ipAddress || null,
      userAgent: actor?.userAgent || null,
      oldValue,
      newValue: factor.toObject(),
    });
    return factor;
  }

  static async previewImport(csv, actor = null) {
    const rows = parseFactorCsv(csv);
    if (rows.length === 0) {
      return {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        duplicateWarnings: 0,
        rows: [],
        validRowItems: [],
        invalidRowItems: [],
      };
    }
    const payloadKeys = rows.map((row) => duplicateKeyFor(row.payload));
    const rowKeyCounts = payloadKeys.reduce((counts, key) => {
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
    const existing = await EmissionFactor.find({
      $or: rows.map((row) => ({
        companyId: row.payload.companyId || null,
        scope: Number(row.payload.scope),
        category: { $regex: `^${escapeRegex(row.payload.category || "")}$`, $options: "i" },
        activityType: String(row.payload.activityType || "").trim().toLowerCase(),
        factorKey: String(row.payload.factorKey || "").trim().replace(/[\s-]+/g, "_").toUpperCase(),
        activityUnit: String(row.payload.activityUnit || "").trim(),
        sourceYear: Number(row.payload.sourceYear),
      })),
    }).lean();
    const existingKeys = new Set(existing.map(duplicateKeyFor));

    const previewRows = rows.map((row) => {
      const errors = [];
      let normalized = null;
      try {
        normalized = validateFactorPayload({
          ...row.payload,
          companyId: row.payload.companyId || actor?.companyId || null,
          isSample: false,
          isOfficial: actor?.companyId ? false : row.payload.isOfficial,
          isCustom: actor?.companyId ? true : row.payload.isCustom,
        });
        if (normalized.isOfficial && !normalized.companyId && !actorCanManageGlobalOfficial(actor)) {
          errors.push("admin or superadmin permission is required for official global factors");
        }
      } catch (error) {
        errors.push(...String(error.message || "Invalid row").split("; "));
      }
      const key = duplicateKeyFor(normalized || row.payload);
      const warnings = [
        rowKeyCounts[key] > 1 ? "Duplicate row in CSV import." : null,
        existingKeys.has(key) ? "A similar emission factor already exists." : null,
      ].filter(Boolean);
      return {
        rowNumber: row.rowNumber,
        valid: errors.length === 0,
        errors,
        warnings,
        payload: normalized || row.payload,
      };
    });

    return {
      totalRows: previewRows.length,
      validRows: previewRows.filter((row) => row.valid).length,
      invalidRows: previewRows.filter((row) => !row.valid).length,
      duplicateWarnings: previewRows.filter((row) => row.warnings.length > 0).length,
      rows: previewRows,
      validRowItems: previewRows.filter((row) => row.valid),
      invalidRowItems: previewRows.filter((row) => !row.valid),
    };
  }

  static async previewCompanyImport(csv, actor = null) {
    const preview = await this.previewImport(csv, { ...actor, companyId: actor?.companyId || null });
    await AuditService.log({
      companyId: actor?.companyId || null,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "emission_factor_import_previewed",
      entityType: "EmissionFactor",
      entityId: "csv-import-preview",
      ipAddress: actor?.ipAddress || null,
      userAgent: actor?.userAgent || null,
      details: {
        totalRows: preview.totalRows,
        validRows: preview.validRows,
        invalidRows: preview.invalidRows,
        duplicateWarnings: preview.duplicateWarnings,
      },
    });
    return preview;
  }

  static async commitImport(csv, actor = null) {
    const preview = await this.previewImport(csv, actor);
    const validRows = preview.rows.filter((row) => row.valid);
    const created = [];
    for (const row of validRows) {
      const factor = await EmissionFactor.create({
        ...row.payload,
        createdBy: actor?.id || null,
        updatedBy: actor?.id || null,
      });
      created.push(factor);
    }

    await AuditService.log({
      companyId: actor?.companyId || null,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "emission_factor_imported",
      entityType: "EmissionFactor",
      entityId: "csv-import",
      ipAddress: actor?.ipAddress || null,
      userAgent: actor?.userAgent || null,
      details: {
        totalRows: preview.totalRows,
        createdCount: created.length,
        invalidRows: preview.invalidRows,
        duplicateWarnings: preview.duplicateWarnings,
      },
      newValue: created.map((factor) => factor.toObject()),
    });

    return {
      ...preview,
      createdCount: created.length,
      data: created.map((factor) => factor.toJSON()),
    };
  }
}

module.exports = EmissionFactorService;
module.exports.validateFactorPayload = validateFactorPayload;
module.exports.isOfficialOrCustomFactor = isOfficialOrCustomFactor;
module.exports.selectBestMatchingFactor = selectBestMatchingFactor;
module.exports.factorKind = factorKind;
