const { Shipment, Supplier, LedgerEntry, CarbonProject, Transaction, Setting, EmissionRecord, Report } = require("../models");
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
      const [records, shipments, suppliers, ledgerEntries, projects, transactions, settings, reports] = await Promise.all([
        EmissionRecord.find({ companyId }).lean(),
        Shipment.find({ companyId }).lean(),
        Supplier.find({ companyId }).lean(),
        LedgerEntry.find({ companyId }).lean(),
        CarbonProject.find({ companyId }).lean(),
        Transaction.find({ companyId, status: "COMPLETED" }).lean(),
        Setting.findOne({ companyId }).lean(),
        Report.find({ companyId }).sort({ generatedAt: -1 }).limit(10).lean(),
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

      const categoryMap = new Map();
      const facilityMap = new Map();
      records.forEach((record) => {
        const amountTonnes = Number(record.amountTonnes || 0);
        const category = record.category || "Uncategorized";
        const categoryBucket = categoryMap.get(category) || { name: category, value: 0, scope1: 0, scope2: 0, scope3: 0 };
        categoryBucket.value = round(categoryBucket.value + amountTonnes);
        if (record.scope === 1) categoryBucket.scope1 = round(categoryBucket.scope1 + amountTonnes);
        if (record.scope === 2) categoryBucket.scope2 = round(categoryBucket.scope2 + amountTonnes);
        if (record.scope === 3) categoryBucket.scope3 = round(categoryBucket.scope3 + amountTonnes);
        categoryMap.set(category, categoryBucket);

        const facility = record.facilityName || record.businessUnit || record.activityData?.origin || "Enterprise total";
        const facilityBucket = facilityMap.get(facility) || { name: facility, value: 0 };
        facilityBucket.value = round(facilityBucket.value + amountTonnes);
        facilityMap.set(facility, facilityBucket);
      });

      const requiredDataSignals = [
        records.some((record) => record.scope === 1),
        records.some((record) => record.scope === 2),
        records.some((record) => record.scope === 3),
        Boolean(settings?.operationalMetrics),
        shipments.length > 0,
        suppliers.length > 0,
      ];
      const dataCompletenessPct = round((requiredDataSignals.filter(Boolean).length / requiredDataSignals.length) * 100, 2);
      const statusCounts = records.reduce((accumulator, record) => {
        const status = record.dataStatus || "draft";
        accumulator[status] = (accumulator[status] || 0) + 1;
        return accumulator;
      }, {
        draft: 0,
        submitted: 0,
        reviewed: 0,
        approved: 0,
        rejected: 0,
        needs_correction: 0,
      });
      const approvedRecords = records.filter((record) => record.dataStatus === "approved").length;
      const unapprovedRecords = records.length - approvedRecords;
      const reportsGenerated = reports.length;
      const latestReport = reports[0] || null;

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
          dataCompletenessPct,
          activitiesRecorded: records.length,
          totalRecords: records.length,
          draftRecords: statusCounts.draft,
          submittedRecords: statusCounts.submitted,
          reviewedRecords: statusCounts.reviewed,
          approvedRecords,
          rejectedRecords: statusCounts.rejected,
          needsCorrectionRecords: statusCounts.needs_correction,
          unapprovedRecords,
          missingFactorCount: records.filter((record) => !record.factorValue).length,
          sampleFactorUsageCount: records.filter((record) => record.factorIsSample !== false).length,
          reportsGenerated,
          reportStatus: latestReport?.status || "NOT_GENERATED",
        },
        monthly,
        costVsEmissions: monthly.map((entry) => ({
          name: entry.name,
          cost: entry.cost,
          emissions: entry.emissions,
        })),
        transportModes,
        scopeBreakdown: [
          { name: "Scope 1", value: round(scopeSummary.scope1), percentage: scopeSummary.totalEmissions ? round((scopeSummary.scope1 / scopeSummary.totalEmissions) * 100, 2) : 0 },
          { name: "Scope 2", value: round(scopeSummary.scope2), percentage: scopeSummary.totalEmissions ? round((scopeSummary.scope2 / scopeSummary.totalEmissions) * 100, 2) : 0 },
          { name: "Scope 3", value: round(scopeSummary.scope3), percentage: scopeSummary.totalEmissions ? round((scopeSummary.scope3 / scopeSummary.totalEmissions) * 100, 2) : 0 },
        ],
        categories: Array.from(categoryMap.values()).sort((left, right) => right.value - left.value).slice(0, 8),
        facilities: Array.from(facilityMap.values()).sort((left, right) => right.value - left.value).slice(0, 8),
        dataQuality: {
          completenessPct: dataCompletenessPct,
          requiredSignals: requiredDataSignals.length,
          completedSignals: requiredDataSignals.filter(Boolean).length,
          sampleFactorRecords: records.filter((record) => record.factorIsSample !== false).length,
          missingFactorRecords: records.filter((record) => !record.factorValue).length,
          approvedRecords,
          draftRecords: statusCounts.draft,
          submittedRecords: statusCounts.submitted,
          reviewedRecords: statusCounts.reviewed,
          rejectedRecords: statusCounts.rejected,
          needsCorrectionRecords: statusCounts.needs_correction,
          unapprovedRecords,
          status: dataCompletenessPct >= 80 ? "READY" : dataCompletenessPct >= 50 ? "PARTIAL" : "NEEDS_DATA",
        },
        reportStatus: {
          generatedCount: reportsGenerated,
          latestStatus: latestReport?.status || "NOT_GENERATED",
          latestGeneratedAt: latestReport?.generatedAt || null,
        },
      };
    });
  }
}

module.exports = DashboardService;
