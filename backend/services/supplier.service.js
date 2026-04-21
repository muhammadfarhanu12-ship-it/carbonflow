const { Supplier } = require("../models");
const BaseService = require("./base.service");
const EmissionRecordService = require("./emissionRecord.service");
const AuditService = require("./audit.service");
const { calculateSupplierScore, buildPersistedScoreFields, toRiskScore } = require("./supplierScoring.service");

class SupplierService extends BaseService {
  static toSupplierView(supplier) {
    if (!supplier) {
      return supplier;
    }

    const baseSupplier = typeof supplier.toJSON === "function" ? supplier.toJSON() : { ...supplier };
    const scoreResult = calculateSupplierScore(baseSupplier);

    return {
      ...baseSupplier,
      emissionIntensity: scoreResult.emissionIntensity ?? Number(baseSupplier.emissionIntensity ?? baseSupplier.emissionFactor ?? 0),
      carbonScore: scoreResult.totalScore,
      esgScore: scoreResult.totalScore,
      riskScore: toRiskScore(scoreResult.totalScore),
      riskLevel: scoreResult.riskLevel,
      supplierScoreBreakdown: scoreResult.breakdown,
      supplierScoreInsights: scoreResult.insights,
      supplierBenchmark: scoreResult.benchmark,
      riskTrend: scoreResult.riskTrend,
      scoreCalculatedAt: scoreResult.calculatedAt,
      scoreResult,
    };
  }

  static async list(query = {}, companyId) {
    const filter = {
      companyId,
      ...this.getLikeFilter(["name", "region", "country", "category", "contactEmail"], query.search),
    };

    if (query.riskLevel) filter.riskLevel = query.riskLevel;
    if (query.verificationStatus) filter.verificationStatus = query.verificationStatus;
    if (query.category) filter.category = query.category;

    const result = await this.buildListResult(Supplier, {
      query,
      filter,
      sort: { riskScore: -1, createdAt: -1 },
    });

    return {
      ...result,
      data: result.data.map((supplier) => this.toSupplierView(supplier)),
    };
  }

  static async getById(id, companyId) {
    const supplier = await Supplier.findOne({ _id: id, companyId });

    if (!supplier) {
      const error = new Error("Supplier not found");
      error.status = 404;
      throw error;
    }

    return supplier;
  }

  static enrichPayload(payload = {}) {
    const scoringFields = buildPersistedScoreFields({
      ...payload,
      emissionIntensity: payload.emissionIntensity ?? payload.emissionFactor ?? null,
    });

    return {
      ...payload,
      emissionIntensity: scoringFields.emissionIntensity,
      revenue: scoringFields.revenue,
      hasISO14001: scoringFields.hasISO14001,
      hasSBTi: scoringFields.hasSBTi,
      dataTransparencyScore: scoringFields.dataTransparencyScore,
      lastReportedAt: scoringFields.lastReportedAt,
      carbonScore: scoringFields.carbonScore,
      esgScore: scoringFields.esgScore,
      riskScore: scoringFields.riskScore,
      riskLevel: scoringFields.riskLevel,
      supplierScoreBreakdown: scoringFields.supplierScoreBreakdown,
      supplierScoreInsights: scoringFields.supplierScoreInsights,
      supplierBenchmark: scoringFields.supplierBenchmark,
      riskTrend: scoringFields.riskTrend,
      scoreCalculatedAt: scoringFields.scoreCalculatedAt,
      scoreVersion: scoringFields.scoreVersion,
    };
  }

  static async create(payload, companyId, actor = null) {
    const supplier = await Supplier.create(this.enrichPayload({ ...payload, companyId }));
    await EmissionRecordService.syncSupplierRecord(supplier);
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "supplier.created",
      entityType: "Supplier",
      entityId: supplier.id,
      details: {
        name: supplier.name,
        riskLevel: supplier.riskLevel,
      },
    });
    return supplier;
  }

  static async update(id, payload, companyId, actor = null) {
    const supplier = await this.getById(id, companyId);
    const nextPayload = this.enrichPayload({ ...supplier.toJSON(), ...payload, companyId });

    await supplier.update(nextPayload);
    const updatedSupplier = await this.getById(id, companyId);
    await EmissionRecordService.syncSupplierRecord(updatedSupplier);
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "supplier.updated",
      entityType: "Supplier",
      entityId: id,
      details: {
        name: updatedSupplier.name,
        riskLevel: updatedSupplier.riskLevel,
        riskScore: updatedSupplier.riskScore,
      },
    });
    return updatedSupplier;
  }

  static async remove(id, companyId, actor = null) {
    const supplier = await this.getById(id, companyId);
    await supplier.destroy();
    await EmissionRecordService.deleteRecord(companyId, `supplier:${id}`);
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "supplier.deleted",
      entityType: "Supplier",
      entityId: id,
      details: {
        name: supplier.name,
      },
    });
    return { success: true };
  }
}

module.exports = SupplierService;
