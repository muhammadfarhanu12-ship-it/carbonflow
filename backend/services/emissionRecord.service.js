const { EmissionRecord, EmissionFactor } = require("../models");
const {
  calculateActivityEmission,
  calculateScope1,
  calculateScope2,
  calculateShipmentEmissions,
  getSampleFactors,
  resolveSampleFactor,
  round,
  toKgFromTonnes,
} = require("./carbonEngine");
const cache = require("../utils/cache");
const AuditService = require("./audit.service");
const EmissionFactorService = require("./emissionFactor.service");
const { hasPermission, normalizeRole } = require("../middlewares/rbac");

const DATA_STATUSES = ["draft", "submitted", "reviewed", "approved", "rejected", "needs_correction"];
const REVIEW_ROLES = new Set(["manager", "admin", "owner"]);

function getPeriod(occurredAt) {
  const date = new Date(occurredAt || Date.now());

  return {
    occurredAt: date,
    periodMonth: date.getUTCMonth() + 1,
    periodYear: date.getUTCFullYear(),
  };
}

function invalidateCompanyMetrics(companyId) {
  cache.removeByPrefix(`dashboard:${companyId}:`);
  cache.removeByPrefix(`ledger:${companyId}:`);
}

class EmissionRecordService {
  static async list(companyId, query = {}) {
    const filter = { companyId };
    if (query.scope) filter.scope = Number(query.scope);
    if (query.category) filter.category = query.category;
    if (query.status) filter.dataStatus = query.status;
    if (query.dataStatus) filter.dataStatus = query.dataStatus;

    const limit = Math.min(Math.max(Number(query.pageSize || 50), 1), 100);
    const page = Math.max(Number(query.page || 1), 1);
    const [data, total] = await Promise.all([
      EmissionRecord.find(filter).sort({ occurredAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      EmissionRecord.countDocuments(filter),
    ]);

    return {
      data: data.map((record) => ({ id: record._id, ...record })),
      pagination: {
        page,
        pageSize: limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    };
  }

  static async listFactors(query = {}) {
    const filter = { isActive: true };
    if (query.scope) filter.scope = Number(query.scope);
    if (query.activityType) filter.activityType = query.activityType;
    if (query.region) filter.region = String(query.region).toUpperCase();

    const dbFactors = await EmissionFactor.find(filter).sort({ scope: 1, category: 1, activityType: 1 }).lean();
    if (dbFactors.length > 0) {
      return dbFactors.map((factor) => ({ id: factor._id, ...factor }));
    }

    return getSampleFactors().filter((factor) => (
      (!query.scope || Number(factor.scope) === Number(query.scope))
      && (!query.activityType || factor.activityType === query.activityType)
      && (!query.region || factor.region === String(query.region).toUpperCase() || factor.region === "GLOBAL")
    ));
  }

  static async resolveActivityFactor(payload) {
    const region = String(payload.region || "GLOBAL").trim().toUpperCase();
    const dbFactor = await EmissionFactorService.resolveBestMatch({
      companyId: payload.companyId,
      scope: payload.scope,
      category: payload.category,
      activityType: payload.activityType,
      factorKey: payload.factorKey || payload.fuelType,
      activityUnit: payload.activityUnit || payload.unit,
      country: payload.country,
      region,
      occurredAt: payload.occurredAt,
    });

    return dbFactor || resolveSampleFactor({
      scope: payload.scope,
      activityType: payload.activityType,
      unit: payload.activityUnit || payload.unit,
      region,
      fuelType: payload.fuelType || payload.factorKey,
    });
  }

  static validateActivityPayload(payload = {}) {
    const errors = [];
    const scope = Number(payload.scope);
    const activityAmount = Number(payload.activityAmount ?? payload.amount);

    if (![1, 2, 3].includes(scope)) errors.push("scope must be 1, 2, or 3");
    if (!payload.category) errors.push("category is required");
    if (!payload.activityType) errors.push("activityType is required");
    if (!payload.activityUnit && !payload.unit) errors.push("activityUnit is required");
    if (!Number.isFinite(activityAmount) || activityAmount < 0) errors.push("activityAmount must be a non-negative number");

    if (errors.length) {
      const error = new Error(errors.join("; "));
      error.status = 422;
      throw error;
    }
  }

  static async createActivity(companyId, payload, actor = null) {
    this.validateActivityPayload(payload);
    const factor = await this.resolveActivityFactor({ ...payload, companyId });
    if (!factor && !Number.isFinite(Number(payload.factorValue))) {
      const error = new Error("No emission factor found. Provide factorValue or configure an emission factor.");
      error.status = 422;
      throw error;
    }

    const calculation = calculateActivityEmission(payload, factor);
    const recordKey = payload.recordKey || `activity:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const dataStatus = DATA_STATUSES.includes(payload.dataStatus) ? payload.dataStatus : "draft";
    const now = new Date();
    const record = await this.upsertRecord(companyId, recordKey, {
      scope: Number(payload.scope),
      category: String(payload.category).trim(),
      sourceType: payload.sourceType || "ACTIVITY",
      sourceId: payload.sourceId || null,
      description: payload.description || `${payload.category} activity`,
      activityAmount: calculation.activityAmount,
      activityUnit: calculation.activityUnit,
      amountTonnes: calculation.amountTonnes,
      emissionsKgCo2e: calculation.emissionsKgCo2e,
      emissionsTCo2e: calculation.emissionsTCo2e,
      factorValue: calculation.factorValue,
      factorUnit: calculation.factorUnit,
      factorSource: calculation.factorSource,
      factorSourceYear: calculation.factorSourceYear,
      factorRegion: calculation.factorRegion,
      factorCountry: calculation.factorCountry,
      factorIsSample: calculation.factorIsSample,
      facilityId: payload.facilityId || null,
      facilityName: payload.facilityName || null,
      businessUnit: payload.businessUnit || null,
      reportingPeriod: payload.reportingPeriod || null,
      dataStatus,
      submittedBy: dataStatus === "submitted" ? actor?.id || null : null,
      submittedAt: dataStatus === "submitted" ? now : null,
      createdBy: actor?.id || null,
      activityData: {
        activityType: payload.activityType,
        fuelType: payload.fuelType || null,
        method: payload.method || null,
        notes: payload.notes || null,
        calculationFormula: "emissions = activityAmount x emissionFactor",
      },
      metadata: {
        factorId: factor?._id || factor?.id || null,
        factorKey: factor?.factorKey || factor?.key || payload.factorKey || payload.fuelType || null,
        factorIsSample: calculation.factorIsSample,
      },
      occurredAt: payload.occurredAt || new Date(),
    });

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "emission_record_created",
      entityType: "EmissionRecord",
      entityId: record.id,
      ipAddress: actor?.ipAddress || null,
      userAgent: actor?.userAgent || null,
      details: {
        scope: record.scope,
        category: record.category,
        amountTonnes: record.amountTonnes,
      },
      newValue: record.toObject ? record.toObject() : record,
    });

    return record;
  }

  static async updateStatus(companyId, id, status, actor = null, notes = null) {
    if (!DATA_STATUSES.includes(status)) {
      const error = new Error(`dataStatus must be one of: ${DATA_STATUSES.join(", ")}`);
      error.status = 422;
      throw error;
    }

    const record = await EmissionRecord.findOne({ _id: id, companyId });
    if (!record) {
      const error = new Error("Emission record not found");
      error.status = 404;
      throw error;
    }

    const role = normalizeRole(actor?.role);
    const currentStatus = record.dataStatus || "draft";
    const normalizedNotes = typeof notes === "string" ? notes.trim() : "";
    const canReview = REVIEW_ROLES.has(role) && hasPermission(actor, "records:approve");
    const canSubmit = role === "data_entry" && hasPermission(actor, "records:edit");
    const isSubmitTransition = status === "submitted" && ["draft", "rejected", "needs_correction"].includes(currentStatus);
    const isReviewTransition = canReview && (
      (currentStatus === "submitted" && ["reviewed", "approved", "rejected", "needs_correction"].includes(status))
      || (currentStatus === "reviewed" && ["approved", "rejected", "needs_correction"].includes(status))
      || (currentStatus === "rejected" && status === "needs_correction")
      || (currentStatus === "needs_correction" && status === "rejected")
    );

    if (!(canSubmit && isSubmitTransition) && !isReviewTransition) {
      const error = new Error(`Role ${role || "unknown"} cannot change emission record status from ${currentStatus} to ${status}`);
      error.status = canReview || canSubmit ? 422 : 403;
      throw error;
    }

    if (["rejected", "needs_correction"].includes(status) && !normalizedNotes) {
      const error = new Error("Notes are required when rejecting a record or requesting correction");
      error.status = 422;
      throw error;
    }

    const actionByStatus = {
      submitted: "emission_record_submitted",
      reviewed: "emission_record_reviewed",
      approved: "emission_record_approved",
      rejected: "emission_record_rejected",
      needs_correction: "emission_record_updated",
    };

    const oldValue = {
      dataStatus: record.dataStatus,
      submittedBy: record.submittedBy,
      submittedAt: record.submittedAt,
      reviewedBy: record.reviewedBy,
      reviewedAt: record.reviewedAt,
      approvedBy: record.approvedBy,
      approvedAt: record.approvedAt,
      rejectedBy: record.rejectedBy,
      rejectedAt: record.rejectedAt,
      approvalNotes: record.approvalNotes,
      correctionNotes: record.correctionNotes,
    };
    const changedAt = new Date();
    record.dataStatus = status;

    if (status === "submitted") {
      record.submittedBy = actor?.id || null;
      record.submittedAt = changedAt;
      record.correctionNotes = null;
    }

    if (status === "reviewed") {
      record.reviewedBy = actor?.id || null;
      record.reviewedAt = changedAt;
      record.approvalNotes = normalizedNotes || null;
    }

    if (status === "approved") {
      record.reviewedBy = record.reviewedBy || actor?.id || null;
      record.reviewedAt = record.reviewedAt || changedAt;
      record.approvedBy = actor?.id || null;
      record.approvedAt = changedAt;
      record.approvalNotes = normalizedNotes || null;
      record.correctionNotes = null;
    }

    if (status === "rejected") {
      record.rejectedBy = actor?.id || null;
      record.rejectedAt = changedAt;
      record.correctionNotes = normalizedNotes;
      record.approvalNotes = null;
    }

    if (status === "needs_correction") {
      record.reviewedBy = actor?.id || null;
      record.reviewedAt = changedAt;
      record.correctionNotes = normalizedNotes;
      record.approvalNotes = null;
    }

    await record.save();
    invalidateCompanyMetrics(companyId);

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: actionByStatus[status] || "emission_record_updated",
      entityType: "EmissionRecord",
      entityId: record.id,
      ipAddress: actor?.ipAddress || null,
      userAgent: actor?.userAgent || null,
      oldValue,
      newValue: {
        dataStatus: record.dataStatus,
        submittedBy: record.submittedBy,
        submittedAt: record.submittedAt,
        reviewedBy: record.reviewedBy,
        reviewedAt: record.reviewedAt,
        approvedBy: record.approvedBy,
        approvedAt: record.approvedAt,
        rejectedBy: record.rejectedBy,
        rejectedAt: record.rejectedAt,
        approvalNotes: record.approvalNotes,
        correctionNotes: record.correctionNotes,
      },
    });

    return record;
  }

  static async upsertRecord(companyId, recordKey, payload) {
    const period = getPeriod(payload.occurredAt);

    const record = await EmissionRecord.findOneAndUpdate(
      { companyId, recordKey },
      {
        $set: {
          ...payload,
          companyId,
          recordKey,
          emissionsKgCo2e: payload.emissionsKgCo2e ?? toKgFromTonnes(payload.amountTonnes),
          emissionsTCo2e: payload.emissionsTCo2e ?? payload.amountTonnes,
          occurredAt: period.occurredAt,
          periodMonth: period.periodMonth,
          periodYear: period.periodYear,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    invalidateCompanyMetrics(companyId);
    return record;
  }

  static async deleteRecord(companyId, recordKey) {
    await EmissionRecord.deleteOne({ companyId, recordKey });
    invalidateCompanyMetrics(companyId);
  }

  static async syncShipmentRecord(shipment, supplier = null) {
    const computed = calculateShipmentEmissions(shipment, shipment.emissionFactorOverrides || {});

    return this.upsertRecord(shipment.companyId, `shipment:${shipment.id || shipment._id}`, {
      scope: 3,
      category: "Logistics",
      sourceType: "SHIPMENT",
      sourceId: shipment.id || shipment._id,
      shipmentId: shipment.id || shipment._id,
      supplierId: shipment.supplierId || null,
      description: `${shipment.reference} ${shipment.origin} to ${shipment.destination}`,
      amountTonnes: round(shipment.emissionsTonnes ?? computed.emissionsTonnes),
      costUsd: Number(shipment.costUsd || 0),
      factorValue: computed.factorKgPerTonKm,
      factorUnit: "kgCO2e/ton-km",
      activityData: {
        reference: shipment.reference,
        origin: shipment.origin,
        destination: shipment.destination,
        carrier: shipment.carrier,
        supplierName: supplier?.name || null,
        distanceKm: computed.distanceKm,
        weightKg: computed.weightKg,
        tonKm: computed.tonKm,
        transportMode: computed.transportMode,
      },
      metadata: {
        status: shipment.status,
        carbonCostUsd: Number(shipment.carbonCostUsd || 0),
      },
      occurredAt: shipment.shipmentDate || shipment.createdAt || new Date(),
    });
  }

  static async syncSupplierRecord(supplier) {
    return this.upsertRecord(supplier.companyId, `supplier:${supplier.id || supplier._id}`, {
      scope: 3,
      category: "Supplier",
      sourceType: "SUPPLIER",
      sourceId: supplier.id || supplier._id,
      supplierId: supplier.id || supplier._id,
      description: `${supplier.name} supplier footprint`,
      amountTonnes: round(Number(supplier.totalEmissions || 0)),
      costUsd: 0,
      factorValue: round(Number(supplier.emissionIntensity ?? supplier.emissionFactor ?? 0), 4),
      factorUnit: "tCO2e/intensity-unit",
      activityData: {
        supplierName: supplier.name,
        country: supplier.country,
        category: supplier.category,
        complianceScore: supplier.complianceScore,
        countryRiskIndex: supplier.countryRiskIndex,
        riskLevel: supplier.riskLevel,
      },
      metadata: {
        carbonScore: supplier.carbonScore,
        riskScore: supplier.riskScore,
      },
      occurredAt: supplier.updatedAt || supplier.createdAt || new Date(),
    });
  }

  static async syncOperationalRecords(companyId, settings) {
    const overrides = settings.emissionFactorOverrides || {};
    const operationalMetrics = settings.operationalMetrics || {};
    const scope1 = calculateScope1(operationalMetrics, overrides);
    const scope2 = calculateScope2({
      ...operationalMetrics,
      region: settings.region || "GLOBAL",
    }, overrides);
    const occurredAt = new Date();

    await Promise.all([
      this.upsertRecord(companyId, "operational:scope1", {
        scope: 1,
        category: "Direct Operations",
        sourceType: "SCOPE1_STATIONARY_FUEL",
        description: "Operational Scope 1 baseline",
        amountTonnes: scope1.totalTonnes,
        factorValue: 0,
        factorUnit: "mixed",
        activityData: {
          breakdown: scope1.breakdown,
          operationalMetrics,
        },
        metadata: {
          stationaryFuelType: operationalMetrics.stationaryFuelType || "DIESEL",
          mobileFuelType: operationalMetrics.mobileFuelType || "DIESEL",
        },
        occurredAt,
      }),
      this.upsertRecord(companyId, "operational:scope2", {
        scope: 2,
        category: "Purchased Electricity",
        sourceType: "SCOPE2_ELECTRICITY",
        description: "Operational Scope 2 baseline",
        amountTonnes: scope2.totalTonnes,
        factorValue: scope2.factorKgPerKwh,
        factorUnit: "kgCO2e/kWh",
        activityData: {
          electricityKwh: scope2.electricityKwh,
          renewableElectricityPct: scope2.renewableElectricityPct,
          locationBasedTonnes: scope2.locationBasedTonnes,
          marketBasedTonnes: scope2.marketBasedTonnes,
        },
        metadata: {
          region: scope2.region,
        },
        occurredAt,
      }),
    ]);
  }

  static async getSummary(companyId) {
    const records = await EmissionRecord.find({ companyId }).lean();

    return records.reduce((accumulator, record) => {
      const amountTonnes = Number(record.amountTonnes || 0);
      accumulator.totalEmissions = round(accumulator.totalEmissions + amountTonnes);

      if (record.scope === 1) {
        accumulator.scope1 = round(accumulator.scope1 + amountTonnes);
      }

      if (record.scope === 2) {
        accumulator.scope2 = round(accumulator.scope2 + amountTonnes);
      }

      if (record.scope === 3) {
        accumulator.scope3 = round(accumulator.scope3 + amountTonnes);
      }

      return accumulator;
    }, {
      totalEmissions: 0,
      scope1: 0,
      scope2: 0,
      scope3: 0,
    });
  }
}

module.exports = EmissionRecordService;
