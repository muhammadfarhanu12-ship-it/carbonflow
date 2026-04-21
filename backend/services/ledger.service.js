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

    const recordFilter = {
      companyId,
    };
    if (query.scope) recordFilter.scope = Number(query.scope);

    const [entries, records, suppliers, emissionSummary] = await Promise.all([
      this.buildListResult(LedgerEntry, {
        query,
        filter,
        populate: [{ path: "shipment", model: "Shipment" }],
        sort: { entryDate: -1, createdAt: -1 },
      }),
      EmissionRecord.find(recordFilter).sort({ occurredAt: -1 }).limit(25).lean(),
      Supplier.find({ companyId }).select("name").lean(),
      EmissionRecordService.getSummary(companyId),
    ]);

    const supplierMap = new Map(suppliers.map((supplier) => [supplier._id || supplier.id, supplier.name]));
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

    const categoryMap = new Map();
    const supplierBreakdownMap = new Map();
    const monthWindow = buildMonthWindow(6);
    const monthMap = new Map(monthWindow.map((item) => [item.key, item]));

    records.forEach((record) => {
      const amountTonnes = Number(record.amountTonnes || 0);
      const categoryKey = record.category || "Uncategorized";
      const currentCategory = categoryMap.get(categoryKey) || { name: categoryKey, value: 0 };
      currentCategory.value = round(currentCategory.value + amountTonnes);
      categoryMap.set(categoryKey, currentCategory);

      if (record.supplierId) {
        const supplierKey = String(record.supplierId);
        const currentSupplier = supplierBreakdownMap.get(supplierKey) || {
          name: supplierMap.get(supplierKey) || record.activityData?.supplierName || "Unassigned supplier",
          value: 0,
        };
        currentSupplier.value = round(currentSupplier.value + amountTonnes);
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

    return {
      ...entries,
      records: records.map((record) => ({
        id: record._id,
        ...record,
        supplierName: record.supplierId ? (supplierMap.get(String(record.supplierId)) || record.activityData?.supplierName || null) : null,
      })),
      summary: {
        totalSpend: round(totals.totalSpend),
        totalCarbonTax: round(totals.totalCarbonTax),
        totalCarbonCost: round(totals.totalCarbonCost),
        totalEmissions: round(emissionSummary.totalEmissions),
        carbonCostRatio: totals.totalSpend ? round((totals.totalCarbonCost / totals.totalSpend) * 100, 2) : 0,
        scope1: round(emissionSummary.scope1),
        scope2: round(emissionSummary.scope2),
        scope3: round(emissionSummary.scope3),
      },
      breakdowns: {
        byCategory: Array.from(categoryMap.values()).sort((left, right) => right.value - left.value),
        bySupplier: Array.from(supplierBreakdownMap.values()).sort((left, right) => right.value - left.value).slice(0, 5),
        byMonth: monthWindow.map((item) => ({
          name: item.name,
          scope1: item.scope1,
          scope2: item.scope2,
          scope3: item.scope3,
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

    const emissionsTonnes = Number(payload.emissionsTonnes ?? shipment?.emissionsTonnes ?? 0);
    const logisticsCostUsd = Number(payload.logisticsCostUsd ?? shipment?.costUsd ?? 0);
    const carbonTaxUsd = calculateCarbonCost(emissionsTonnes, carbonPricePerTon);

    const entry = await LedgerEntry.create({
      ...payload,
      companyId,
      shipmentId: payload.shipmentId || null,
      emissionsTonnes,
      logisticsCostUsd,
      carbonTaxUsd,
      carbonCostUsd: carbonTaxUsd,
      totalCostUsd: round(logisticsCostUsd + carbonTaxUsd),
    });

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "ledger.created",
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
    const carbonTaxUsd = calculateCarbonCost(emissionsTonnes, carbonPricePerTon);

    await entry.update({
      ...payload,
      emissionsTonnes,
      logisticsCostUsd,
      carbonTaxUsd,
      carbonCostUsd: carbonTaxUsd,
      totalCostUsd: round(logisticsCostUsd + carbonTaxUsd),
    });

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "ledger.updated",
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
