const { EmissionRecord } = require("../models");
const { calculateScope1, calculateScope2, calculateShipmentEmissions, round } = require("./carbonEngine");
const cache = require("../utils/cache");

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
  static async upsertRecord(companyId, recordKey, payload) {
    const period = getPeriod(payload.occurredAt);

    const record = await EmissionRecord.findOneAndUpdate(
      { companyId, recordKey },
      {
        $set: {
          ...payload,
          companyId,
          recordKey,
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
