const { LedgerEntry, Shipment, EmissionRecord, Supplier } = require("../models");
const BaseService = require("./base.service");
const EmissionRecordService = require("./emissionRecord.service");
const AuditService = require("./audit.service");
const { round } = require("./carbonEngine");

function calculateCarbonCost(emissionsTonnes, carbonPricePerTon = 55) {
  return round(Number(emissionsTonnes || 0) * Number(carbonPricePerTon || 55), 2);
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function roundTonnes(value) {
  return Number(Number(value || 0).toFixed(4));
}

function normalizeLinkedShipmentIds(transaction = {}) {
  const ids = [];

  if (Array.isArray(transaction.shipmentIds)) {
    ids.push(...transaction.shipmentIds);
  }

  if (transaction.shipmentId) {
    ids.push(transaction.shipmentId);
  }

  return Array.from(new Set(
    ids.map((id) => String(id || "").trim()).filter(Boolean),
  ));
}

function withSession(query, session) {
  return session ? query.session(session) : query;
}

function hasMissingFactor(record = {}) {
  return record.calculationStatus === "missing_factor"
    || record.calculationStatus === "draft_incomplete"
    || !record.factorValue
    || !record.factorUnit;
}

function buildMonthWindow(count = 6) {
  const months = [];
  const cursor = new Date();
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);

  for (let index = count - 1; index >= 0; index -= 1) {
    const nextDate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - index, 1));
    months.push({
      key: `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, "0")}`,
      name: nextDate.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
      scope1: 0,
      scope2: 0,
      scope3: 0,
      draftScope1: 0,
      draftScope2: 0,
      draftScope3: 0,
      missingFactorCount: 0,
    });
  }

  return months;
}

class LedgerService extends BaseService {
  static async linkOffsetTransactionToShipments(transaction, companyId, actor = null, options = {}) {
    const linkedShipmentIds = normalizeLinkedShipmentIds(transaction);
    if (!linkedShipmentIds.length) {
      return [];
    }

    const session = options.session || null;
    const transactionId = String(transaction.id || transaction._id || "").trim();
    const entryDate = new Date(transaction.completedAt || transaction.retiredAt || transaction.createdAt || new Date())
      .toISOString()
      .slice(0, 10);

    const existingEntries = await withSession(
      LedgerEntry.find({
        companyId,
        transactionId,
        category: "OFFSET",
      }).select("_id"),
      session,
    );

    if (existingEntries.length > 0) {
      return existingEntries;
    }

    const shipments = await withSession(
      Shipment.find({
        _id: { $in: linkedShipmentIds },
        companyId,
      }).select("_id reference emissionsTonnes"),
      session,
    );

    if (!shipments.length) {
      return [];
    }

    const shipmentMap = new Map(shipments.map((shipment) => [String(shipment.id || shipment._id), shipment]));
    const orderedShipments = linkedShipmentIds
      .map((shipmentId) => shipmentMap.get(shipmentId))
      .filter(Boolean);

    if (!orderedShipments.length) {
      return [];
    }

    const totalRetiredCredits = roundTonnes(Number(transaction.credits || transaction.quantity || 0));
    const totalOffsetSpendUsd = roundMoney(Number(transaction.totalCostUsd || transaction.totalCost || transaction.total || 0));
    const totalShipmentEmissions = orderedShipments.reduce((sum, shipment) => (
      sum + Math.max(Number(shipment.emissionsTonnes || 0), 0)
    ), 0);

    let creditsAllocated = 0;
    let spendAllocated = 0;
    const entries = orderedShipments.map((shipment, index) => {
      const isLastShipment = index === orderedShipments.length - 1;
      const weightingBase = totalShipmentEmissions > 0
        ? Math.max(Number(shipment.emissionsTonnes || 0), 0) / totalShipmentEmissions
        : 1 / orderedShipments.length;

      const allocatedCredits = isLastShipment
        ? roundTonnes(Math.max(totalRetiredCredits - creditsAllocated, 0))
        : roundTonnes(totalRetiredCredits * weightingBase);

      const allocatedSpendUsd = isLastShipment
        ? roundMoney(Math.max(totalOffsetSpendUsd - spendAllocated, 0))
        : roundMoney(totalOffsetSpendUsd * weightingBase);

      creditsAllocated = roundTonnes(creditsAllocated + allocatedCredits);
      spendAllocated = roundMoney(spendAllocated + allocatedSpendUsd);

      const shipmentId = String(shipment.id || shipment._id);
      const shipmentReference = shipment.reference || shipmentId.slice(0, 8);

      return {
        companyId,
        shipmentId,
        transactionId,
        entryDate,
        category: "OFFSET",
        description: `Offset allocation from transaction ${transaction.serialNumber || transactionId.slice(0, 8)} for shipment ${shipmentReference}`,
        logisticsCostUsd: 0,
        emissionsTonnes: allocatedCredits,
        carbonTaxUsd: 0,
        carbonCostUsd: allocatedSpendUsd,
        totalCostUsd: allocatedSpendUsd,
        metadata: {
          source: "BATCH_OFFSET_LINK",
          allocationMethod: totalShipmentEmissions > 0 ? "EMISSIONS_WEIGHTED" : "EQUAL_SPLIT",
          shipmentShareRatio: Number(weightingBase.toFixed(6)),
          linkedShipmentCount: orderedShipments.length,
          projectId: transaction.projectId || null,
          projectName: transaction.projectName || null,
          registry: transaction.registry || null,
          paymentReference: transaction.paymentReference || null,
          linkedBy: actor?.id || null,
          linkedAt: new Date().toISOString(),
        },
      };
    });

    return LedgerEntry.insertMany(entries, session ? { session, ordered: true } : { ordered: true });
  }

  static async list(query = {}, companyId) {
    const filter = {
      companyId,
      ...this.getLikeFilter(["description", "category"], query.search),
    };

    if (query.category) filter.category = query.category;

    const recordFilter = { companyId, dataStatus: { $ne: "archived" } };
    if (query.scope) recordFilter.scope = Number(query.scope);
    if (query.status && query.status !== "all") recordFilter.dataStatus = query.status;
    if (query.view === "all") recordFilter.dataStatus = { $ne: "archived" };
    if (query.inclusion === "approved_only" || query.view === "approved") recordFilter.dataStatus = "approved";
    if (query.view === "drafts") recordFilter.dataStatus = "draft";
    if (query.view === "needs_correction") recordFilter.dataStatus = "needs_correction";
    if (query.view === "archived") recordFilter.dataStatus = "archived";
    if (query.view === "missing_factors") recordFilter.$or = [{ factorValue: null }, { factorValue: 0 }, { factorUnit: null }, { calculationStatus: "missing_factor" }, { calculationStatus: "draft_incomplete" }];
    if (query.view === "sample_factors") recordFilter.factorIsSample = true;
    if (query.category) recordFilter.category = query.category;
    if (query.facility || query.facilityName) recordFilter.facilityName = { $regex: query.facility || query.facilityName, $options: "i" };
    if (query.businessUnit) recordFilter.businessUnit = { $regex: query.businessUnit, $options: "i" };
    if (query.reportingPeriod) recordFilter.reportingPeriod = { $regex: query.reportingPeriod, $options: "i" };
    if (query.supplierId) recordFilter.supplierId = query.supplierId;
    if (query.supplierRiskLevel) recordFilter["activityData.supplierRiskLevel"] = String(query.supplierRiskLevel).toUpperCase();
    if (query.createdBy) recordFilter.createdBy = query.createdBy;
    if (query.factorStatus === "missing") recordFilter.$or = [{ factorValue: null }, { factorValue: 0 }, { factorUnit: null }, { calculationStatus: "missing_factor" }, { calculationStatus: "draft_incomplete" }];
    if (query.factorStatus === "sample") recordFilter.factorIsSample = true;
    if (query.factorStatus === "custom") recordFilter.factorIsSample = false;
    if (query.activityDateFrom || query.activityDateTo) {
      recordFilter.occurredAt = {};
      if (query.activityDateFrom) recordFilter.occurredAt.$gte = new Date(query.activityDateFrom);
      if (query.activityDateTo) recordFilter.occurredAt.$lte = new Date(query.activityDateTo);
    }
    if (query.search) {
      const regex = { $regex: String(query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      recordFilter.$or = [
        ...(recordFilter.$or || []),
        { category: regex },
        { description: regex },
        { facilityName: regex },
        { businessUnit: regex },
        { "metadata.factorKey": regex },
        { "activityData.supplierName": regex },
      ];
    }

    const [entries, records, suppliers, emissionSummary, archivedRecordsCount] = await Promise.all([
      this.buildListResult(LedgerEntry, {
        query,
        filter,
        populate: [{ path: "shipment", model: "Shipment" }],
        sort: { entryDate: -1, createdAt: -1 },
      }),
      EmissionRecord.find(recordFilter).sort({ occurredAt: -1 }).limit(100).lean(),
      Supplier.find({ companyId }).select("name category country riskLevel").lean(),
      EmissionRecord.find({ companyId, dataStatus: { $ne: "archived" } }).lean(),
      EmissionRecord.countDocuments({ companyId, dataStatus: "archived" }),
    ]);

    const supplierMap = new Map(suppliers.map((supplier) => [String(supplier._id || supplier.id), supplier]));
    const totals = (entries.data || []).reduce((accumulator, entry) => {
      accumulator.totalSpend += Number(entry.logisticsCostUsd || 0);
      accumulator.totalCarbonTax += Number(entry.carbonTaxUsd || 0);
      accumulator.totalCarbonCost += Number(entry.carbonCostUsd || 0);
      accumulator.totalLedgerEmissions += Number(entry.emissionsTonnes || 0);
      return accumulator;
    }, {
      totalSpend: 0,
      totalCarbonTax: 0,
      totalCarbonCost: 0,
      totalLedgerEmissions: 0,
    });

    const approvedRecords = emissionSummary.filter((record) => record.dataStatus === "approved");
    const includedRecords = recordFilter.dataStatus === "approved" ? records : approvedRecords;
    const categoryMap = new Map();
    const supplierBreakdownMap = new Map();
    const monthWindow = buildMonthWindow(6);
    const monthMap = new Map(monthWindow.map((item) => [item.key, item]));

    includedRecords.forEach((record) => {
      const amountTonnes = Number(record.amountTonnes || 0);
      const categoryKey = record.category || "Uncategorized";
      const currentCategory = categoryMap.get(categoryKey) || { name: categoryKey, value: 0 };
      currentCategory.value = round(currentCategory.value + amountTonnes);
      categoryMap.set(categoryKey, currentCategory);

      if (record.supplierId || record.activityData?.supplierName) {
        const hasVerifiedLink = Boolean(record.supplierId);
        const supplierKey = hasVerifiedLink ? String(record.supplierId) : `metadata:${record.activityData?.supplierName || "unknown"}`;
        const supplier = hasVerifiedLink ? supplierMap.get(supplierKey) : null;
        const currentSupplier = supplierBreakdownMap.get(supplierKey) || {
          supplierId: hasVerifiedLink ? supplierKey : null,
          name: supplier?.name || record.activityData?.supplierName || "Unverified supplier link",
          category: supplier?.category || record.activityData?.supplierCategory || null,
          country: supplier?.country || record.activityData?.supplierCountry || null,
          riskLevel: supplier?.riskLevel || record.activityData?.supplierRiskLevel || null,
          linkStatus: hasVerifiedLink ? "linked" : "unverified",
          value: 0,
          recordCount: 0,
        };
        currentSupplier.value = round(currentSupplier.value + amountTonnes);
        currentSupplier.recordCount += 1;
        supplierBreakdownMap.set(supplierKey, currentSupplier);
      }

      const key = `${record.periodYear}-${String(record.periodMonth).padStart(2, "0")}`;
      const month = monthMap.get(key);
      if (month) {
        if (record.scope === 1) month.scope1 = round(month.scope1 + amountTonnes);
        if (record.scope === 2) month.scope2 = round(month.scope2 + amountTonnes);
        if (record.scope === 3) month.scope3 = round(month.scope3 + amountTonnes);
      }
    });

    emissionSummary.forEach((record) => {
      const key = `${record.periodYear}-${String(record.periodMonth).padStart(2, "0")}`;
      const month = monthMap.get(key);
      if (month && record.dataStatus !== "approved") {
        if (record.scope === 1) month.draftScope1 = round(month.draftScope1 + Number(record.amountTonnes || 0));
        if (record.scope === 2) month.draftScope2 = round(month.draftScope2 + Number(record.amountTonnes || 0));
        if (record.scope === 3) month.draftScope3 = round(month.draftScope3 + Number(record.amountTonnes || 0));
      }
      if (month && hasMissingFactor(record)) month.missingFactorCount += 1;
    });

    const countByStatus = (status) => emissionSummary.filter((record) => record.dataStatus === status).length;
    const missingFactorRecords = emissionSummary.filter(hasMissingFactor).length;
    const sampleFactorRecords = emissionSummary.filter((record) => record.factorIsSample === true).length;
    const zeroAmountRecords = emissionSummary.filter((record) => Number(record.activityAmount || 0) === 0).length;
    const calculationErrorRecords = emissionSummary.filter((record) => record.calculationStatus === "calculation_error" || (Number(record.amountTonnes || 0) === 0 && Number(record.activityAmount || 0) > 0 && Number(record.factorValue || 0) > 0)).length;
    const supplierLinkedRecords = emissionSummary.filter((record) => Boolean(record.supplierId)).length;
    const unlinkedSupplierRecords = emissionSummary.filter((record) => record.activityData?.supplierName && !record.supplierId).length;
    const missingFacilityRecords = emissionSummary.filter((record) => !record.facilityName && !record.facilityId).length;
    const missingReportingPeriodRecords = emissionSummary.filter((record) => !record.reportingPeriod && !record.reportingPeriodStart).length;
    const approvedTotals = approvedRecords.reduce((accumulator, record) => {
      const amount = Number(record.amountTonnes || 0);
      accumulator.total += amount;
      if (record.scope === 1) accumulator.scope1 += amount;
      if (record.scope === 2) accumulator.scope2 += amount;
      if (record.scope === 3) accumulator.scope3 += amount;
      return accumulator;
    }, { total: 0, scope1: 0, scope2: 0, scope3: 0 });
    const financialExposure = {
      totalSpend: round(totals.totalSpend),
      carbonTax: round(totals.totalCarbonTax),
      ledgerCarbonCost: round(totals.totalCarbonCost),
      carbonCostRatio: totals.totalSpend ? round((totals.totalCarbonCost / totals.totalSpend) * 100, 2) : 0,
    };
    const dataQualityIssues = [
      countByStatus("draft") ? { type: "draft_records", count: countByStatus("draft"), severity: "warning", message: "Draft records are excluded from approved totals." } : null,
      missingFactorRecords ? { type: "missing_factors", count: missingFactorRecords, severity: "critical", message: "Some records are missing emission factors." } : null,
      sampleFactorRecords ? { type: "sample_factors", count: sampleFactorRecords, severity: "warning", message: "Some records use sample factors and are not official." } : null,
      zeroAmountRecords ? { type: "zero_activity", count: zeroAmountRecords, severity: "warning", message: "Some records have zero activity amount." } : null,
      calculationErrorRecords ? { type: "calculation_errors", count: calculationErrorRecords, severity: "critical", message: "Some records may have calculation errors." } : null,
      countByStatus("submitted") ? { type: "needs_approval", count: countByStatus("submitted"), severity: "info", message: "Submitted records are waiting for review." } : null,
      unlinkedSupplierRecords ? { type: "unlinked_suppliers", count: unlinkedSupplierRecords, severity: "warning", message: "Some records only have supplier metadata and are not linked to verified suppliers." } : null,
      missingFacilityRecords ? { type: "missing_facility", count: missingFacilityRecords, severity: "info", message: "Some records are missing facility or business-unit metadata." } : null,
      missingReportingPeriodRecords ? { type: "missing_reporting_period", count: missingReportingPeriodRecords, severity: "warning", message: "Some records are missing reporting-period metadata." } : null,
    ].filter(Boolean);

    const enrichedRecords = await Promise.all(records.map(async (record) => {
      const supplier = record.supplierId ? supplierMap.get(String(record.supplierId)) : null;
      const governance = await EmissionRecordService.buildFactorGovernance(record, companyId);
      return ({
        id: record._id,
        ...record,
        supplierName: supplier?.name || record.activityData?.supplierName || null,
        supplierRiskLevel: supplier?.riskLevel || record.activityData?.supplierRiskLevel || null,
        ...governance,
      });
    }));

    return {
      ...entries,
      records: enrichedRecords,
      summary: {
        totalSpend: round(totals.totalSpend),
        totalCarbonTax: round(totals.totalCarbonTax),
        totalCarbonCost: round(totals.totalCarbonCost),
        totalEmissions: round(approvedTotals.total),
        totalTco2e: round(approvedTotals.total),
        carbonCostRatio: totals.totalSpend ? round((totals.totalCarbonCost / totals.totalSpend) * 100, 2) : 0,
        scope1: round(approvedTotals.scope1),
        scope2: round(approvedTotals.scope2),
        scope3: round(approvedTotals.scope3),
        scope1Tco2e: round(approvedTotals.scope1),
        scope2Tco2e: round(approvedTotals.scope2),
        scope3Tco2e: round(approvedTotals.scope3),
        totalRecords: emissionSummary.length,
        approvedRecords: countByStatus("approved"),
        draftRecords: countByStatus("draft"),
        submittedRecords: countByStatus("submitted"),
        reviewedRecords: countByStatus("reviewed"),
        rejectedRecords: countByStatus("rejected"),
        needsCorrectionRecords: countByStatus("needs_correction"),
        archivedRecords: archivedRecordsCount,
        missingFactorRecords,
        sampleFactorRecords,
        zeroAmountRecords,
        calculationErrorRecords,
        supplierLinkedRecords,
        unlinkedSupplierRecords,
        missingFacilityRecords,
        missingReportingPeriodRecords,
        inclusionPolicy: "approved_only",
      },
      categoryBreakdown: Array.from(categoryMap.values()).sort((left, right) => right.value - left.value),
      supplierBreakdown: Array.from(supplierBreakdownMap.values()).map((item) => ({
        ...item,
        sharePct: approvedTotals.total ? round((item.value / approvedTotals.total) * 100, 2) : 0,
      })).sort((left, right) => right.value - left.value).slice(0, 5),
      monthlyBreakdown: monthWindow,
      financialExposure,
      dataQualityIssues,
      breakdowns: {
        byCategory: Array.from(categoryMap.values()).sort((left, right) => right.value - left.value),
        bySupplier: Array.from(supplierBreakdownMap.values()).map((item) => ({
          ...item,
          sharePct: approvedTotals.total ? round((item.value / approvedTotals.total) * 100, 2) : 0,
        })).sort((left, right) => right.value - left.value).slice(0, 5),
        byMonth: monthWindow.map((item) => ({
          name: item.name,
          scope1: item.scope1,
          scope2: item.scope2,
          scope3: item.scope3,
          draftScope1: item.draftScope1,
          draftScope2: item.draftScope2,
          draftScope3: item.draftScope3,
          missingFactorCount: item.missingFactorCount,
        })),
      },
    };
  }

  static async create(payload, companyId, carbonPricePerTon, actor = null) {
    let shipment = null;

    if (payload.shipmentId) {
      shipment = await Shipment.findOne({ _id: payload.shipmentId, companyId });
      if (!shipment) {
        const error = new Error("Shipment not found for ledger entry");
        error.status = 404;
        throw error;
      }
    }
    let emissionRecord = null;
    if (payload.emissionRecordId) {
      emissionRecord = await EmissionRecord.findOne({ _id: payload.emissionRecordId, companyId }).lean();
      if (!emissionRecord) {
        const error = new Error("Emission record not found for financial ledger entry");
        error.status = 404;
        throw error;
      }
    }
    let supplier = null;
    if (payload.supplierId || emissionRecord?.supplierId) {
      supplier = await Supplier.findOne({ _id: payload.supplierId || emissionRecord.supplierId, companyId }).select("_id name").lean();
      if (!supplier) {
        const error = new Error("Supplier not found for financial ledger entry");
        error.status = 404;
        throw error;
      }
    }

    const emissionsTonnes = Number(payload.emissionsTonnes ?? shipment?.emissionsTonnes ?? 0);
    const logisticsCostUsd = Number(payload.logisticsCostUsd ?? shipment?.costUsd ?? 0);
    const carbonTaxUsd = Number(payload.carbonTaxUsd ?? calculateCarbonCost(emissionsTonnes, carbonPricePerTon));
    const offsetCostUsd = Number(payload.offsetCostUsd || 0);
    const internalCarbonPriceUsd = Number(payload.internalCarbonPriceUsd || carbonPricePerTon || 0);

    const entry = await LedgerEntry.create({
      ...payload,
      companyId,
      shipmentId: payload.shipmentId || null,
      emissionRecordId: payload.emissionRecordId || null,
      supplierId: supplier?._id || payload.supplierId || null,
      supplierVendor: supplier?.name || payload.supplierVendor || emissionRecord?.activityData?.supplierName || null,
      emissionsTonnes,
      logisticsCostUsd,
      offsetCostUsd,
      internalCarbonPriceUsd,
      currency: payload.currency || "USD",
      carbonTaxUsd,
      carbonCostUsd: round(carbonTaxUsd + offsetCostUsd),
      totalCostUsd: round(logisticsCostUsd + carbonTaxUsd + offsetCostUsd),
      createdBy: actor?.id || null,
      updatedBy: actor?.id || null,
    });

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "financial_entry_created",
      entityType: "LedgerEntry",
      entityId: entry.id,
      details: {
        category: entry.category,
        totalCostUsd: entry.totalCostUsd,
      },
    });

    return LedgerEntry.findOne({ _id: entry.id, companyId }).populate({ path: "shipment", model: "Shipment" });
  }

  static async update(id, payload, companyId, carbonPricePerTon, actor = null) {
    const entry = await LedgerEntry.findOne({ _id: id, companyId });
    if (!entry) {
      const error = new Error("Ledger entry not found");
      error.status = 404;
      throw error;
    }

    const emissionsTonnes = Number(payload.emissionsTonnes ?? entry.emissionsTonnes ?? 0);
    const logisticsCostUsd = Number(payload.logisticsCostUsd ?? entry.logisticsCostUsd ?? 0);
    const carbonTaxUsd = Number(payload.carbonTaxUsd ?? calculateCarbonCost(emissionsTonnes, carbonPricePerTon));
    const offsetCostUsd = Number(payload.offsetCostUsd ?? entry.offsetCostUsd ?? 0);

    await entry.update({
      ...payload,
      emissionsTonnes,
      logisticsCostUsd,
      offsetCostUsd,
      internalCarbonPriceUsd: Number(payload.internalCarbonPriceUsd ?? entry.internalCarbonPriceUsd ?? carbonPricePerTon ?? 0),
      currency: payload.currency || entry.currency || "USD",
      carbonTaxUsd,
      carbonCostUsd: round(carbonTaxUsd + offsetCostUsd),
      totalCostUsd: round(logisticsCostUsd + carbonTaxUsd + offsetCostUsd),
      updatedBy: actor?.id || null,
    });

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "financial_entry_updated",
      entityType: "LedgerEntry",
      entityId: id,
      details: {
        category: payload.category || entry.category,
      },
    });

    return LedgerEntry.findOne({ _id: id, companyId }).populate({ path: "shipment", model: "Shipment" });
  }

  static async remove(id, companyId, actor = null) {
    const entry = await LedgerEntry.findOne({ _id: id, companyId });
    if (!entry) {
      const error = new Error("Ledger entry not found");
      error.status = 404;
      throw error;
    }

    await entry.destroy();
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "ledger.deleted",
      entityType: "LedgerEntry",
      entityId: id,
      details: {
        category: entry.category,
      },
    });
    return { success: true };
  }
}

module.exports = LedgerService;
