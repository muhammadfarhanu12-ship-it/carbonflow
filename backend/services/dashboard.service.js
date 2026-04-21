const { Shipment, Supplier, LedgerEntry, CarbonProject, Transaction, Setting, EmissionRecord } = require("../models");
const { round } = require("./carbonEngine");
const cache = require("../utils/cache");

function buildMonthWindow(count = 6) {
  const months = [];
  const cursor = new Date();
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);

  for (let index = count - 1; index >= 0; index -= 1) {
    const nextDate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - index, 1));
    months.push({
      year: nextDate.getUTCFullYear(),
      month: nextDate.getUTCMonth() + 1,
      name: nextDate.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
      scope1: 0,
      scope2: 0,
      scope3: 0,
      emissions: 0,
      cost: 0,
    });
  }

  return months;
}

function getMonthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function coerceDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

class DashboardService {
  static async getMetrics(companyId) {
    return cache.remember(`dashboard:${companyId}:summary`, 60000, async () => {
      const [records, shipments, suppliers, ledgerEntries, projects, transactions, settings] = await Promise.all([
        EmissionRecord.find({ companyId }).lean(),
        Shipment.find({ companyId }).lean(),
        Supplier.find({ companyId }).lean(),
        LedgerEntry.find({ companyId }).lean(),
        CarbonProject.find({ companyId }).lean(),
        Transaction.find({ companyId, status: "COMPLETED" }).lean(),
        Setting.findOne({ companyId }).lean(),
      ]);

      const scopeSummary = records.reduce((accumulator, record) => {
        const amountTonnes = Number(record.amountTonnes || 0);
        accumulator.totalEmissions += amountTonnes;

        if (record.scope === 1) accumulator.scope1 += amountTonnes;
        if (record.scope === 2) accumulator.scope2 += amountTonnes;
        if (record.scope === 3) accumulator.scope3 += amountTonnes;

        return accumulator;
      }, {
        totalEmissions: 0,
        scope1: 0,
        scope2: 0,
        scope3: 0,
      });

      const totalShipmentCost = shipments.reduce((sum, shipment) => sum + Number(shipment.costUsd || 0), 0);
      const totalLedgerSpend = ledgerEntries.reduce((sum, entry) => sum + Number(entry.totalCostUsd || entry.logisticsCostUsd || 0), 0);
      const totalLogisticsCost = round(totalLedgerSpend || totalShipmentCost);
      const totalOffsets = round(transactions.reduce((sum, transaction) => sum + Number(transaction.credits || 0), 0));
      const highRiskSuppliers = suppliers.filter((supplier) => Number(supplier.riskScore || 0) >= 70 || supplier.riskLevel === "HIGH").length;
      const averageSupplierScore = suppliers.length
        ? round(suppliers.reduce((sum, supplier) => sum + Number(supplier.carbonScore || 0), 0) / suppliers.length, 2)
        : 0;
      const operationalMetrics = settings?.operationalMetrics || {};
      const revenueUsd = Number(operationalMetrics.revenueUsd || 0);
      const annualShipmentWeightKg = Number(operationalMetrics.annualShipmentWeightKg || 0);
      const carbonIntensity = revenueUsd > 0
        ? round((scopeSummary.totalEmissions * 1000) / revenueUsd, 4)
        : annualShipmentWeightKg > 0
          ? round((scopeSummary.totalEmissions * 1000) / annualShipmentWeightKg, 4)
          : 0;

      const monthlyTemplate = buildMonthWindow(6);
      const monthlyMap = new Map(monthlyTemplate.map((item) => [getMonthKey(item.year, item.month), item]));

      records.forEach((record) => {
        const key = getMonthKey(record.periodYear, record.periodMonth);
        const bucket = monthlyMap.get(key);
        if (!bucket) {
          return;
        }

        const amountTonnes = Number(record.amountTonnes || 0);
        bucket.emissions = round(bucket.emissions + amountTonnes);

        if (record.scope === 1) bucket.scope1 = round(bucket.scope1 + amountTonnes);
        if (record.scope === 2) bucket.scope2 = round(bucket.scope2 + amountTonnes);
        if (record.scope === 3) bucket.scope3 = round(bucket.scope3 + amountTonnes);
      });

      shipments.forEach((shipment) => {
        const shipmentDate = coerceDate(shipment.shipmentDate || shipment.createdAt);
        const key = getMonthKey(shipmentDate.getUTCFullYear(), shipmentDate.getUTCMonth() + 1);
        const bucket = monthlyMap.get(key);
        if (!bucket) {
          return;
        }

        bucket.cost = round(bucket.cost + Number(shipment.costUsd || 0));
      });

      const monthly = monthlyTemplate.map((item) => ({
        name: item.name,
        scope1: round(item.scope1),
        scope2: round(item.scope2),
        scope3: round(item.scope3),
        emissions: round(item.emissions),
        cost: round(item.cost),
      }));

      const transportModes = ["ROAD", "RAIL", "AIR", "OCEAN"].map((mode) => ({
        name: mode,
        value: round(
          shipments
            .filter((shipment) => shipment.transportMode === mode)
            .reduce((sum, shipment) => sum + Number(shipment.emissionsTonnes || 0), 0),
        ),
      }));

      return {
        summary: {
          totalEmissions: round(scopeSummary.totalEmissions),
          scope1: round(scopeSummary.scope1),
          scope2: round(scopeSummary.scope2),
          scope3: round(scopeSummary.scope3),
          carbonIntensity,
          carbonIntensityUnit: revenueUsd > 0 ? "kgCO2e/USD" : "kgCO2e/kg",
          totalCost: totalLogisticsCost,
          totalLogisticsCost,
          totalOffsets,
          offsetsRetired: totalOffsets,
          highRiskSuppliers,
          activeProjects: projects.filter((project) => ["PUBLISHED", "ACTIVE"].includes(String(project.status || "").toUpperCase())).length,
          averageSupplierScore,
          totalSpend: round(totalLedgerSpend),
          totalCarbonTax: round(ledgerEntries.reduce((sum, entry) => sum + Number(entry.carbonTaxUsd || 0), 0)),
        },
        monthly,
        costVsEmissions: monthly.map((entry) => ({
          name: entry.name,
          cost: entry.cost,
          emissions: entry.emissions,
        })),
        transportModes,
      };
    });
  }
}

module.exports = DashboardService;
