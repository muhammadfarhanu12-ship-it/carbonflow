#!/usr/bin/env node
/* eslint-disable no-console */
const { connectDB, closeDB } = require("../config/db");
const { EmissionRecord, Supplier } = require("../models");
const EmissionRecordService = require("../services/emissionRecord.service");
const { calculateActivityEmission } = require("../services/carbonEngine");

function parseArgs(argv = process.argv.slice(2)) {
  return argv.reduce((args, item) => {
    if (item === "--apply") args.apply = true;
    else if (item === "--force") args.force = true;
    else if (item.startsWith("--companyId=")) args.companyId = item.split("=").slice(1).join("=");
    return args;
  }, { apply: false, force: false, companyId: null });
}

function isMissing(value) {
  return value === undefined || value === null || value === "";
}

async function buildBackfill(record, options = {}) {
  const updates = {};
  const manualReview = [];
  const payload = {
    scope: record.scope,
    category: record.category,
    activityType: record.activityData?.activityType,
    activityAmount: record.activityAmount,
    activityUnit: record.activityUnit,
    factorKey: record.metadata?.factorKey || record.activityData?.fuelType,
    country: record.factorCountry,
    region: record.factorRegion || record.metadata?.region || "GLOBAL",
    occurredAt: record.occurredAt,
  };
  const invalidActivityAmount = !Number.isFinite(Number(record.activityAmount)) || Number(record.activityAmount) <= 0;
  if (invalidActivityAmount) manualReview.push("invalid_activity_amount");

  const factor = invalidActivityAmount ? null : await EmissionRecordService.resolveActivityFactor({ ...payload, companyId: record.companyId });
  if (!factor) manualReview.push("missing_factor");
  if (factor && (options.force || isMissing(record.calculationStatus) || isMissing(record.factorValueUsed))) {
    const calculation = calculateActivityEmission(payload, factor);
    Object.assign(updates, {
      calculationStatus: calculation.calculationStatus,
      formula: record.formula || calculation.formula,
      amountTonnes: options.force || !record.amountTonnes ? calculation.amountTonnes : record.amountTonnes,
      emissionsKgCo2e: options.force || !record.emissionsKgCo2e ? calculation.emissionsKgCo2e : record.emissionsKgCo2e,
      emissionsTCo2e: options.force || !record.emissionsTCo2e ? calculation.emissionsTCo2e : record.emissionsTCo2e,
      emissionFactorId: calculation.emissionFactorId,
      factorValueUsed: calculation.factorValue,
      factorUnitUsed: calculation.factorUnit,
      factorSourceName: calculation.factorSource,
      factorVersion: calculation.factorVersion,
      factorIsOfficial: calculation.factorIsOfficial,
      factorIsCustom: calculation.factorIsCustom,
    });
  } else if (!factor && (options.force || isMissing(record.calculationStatus))) {
    updates.calculationStatus = invalidActivityAmount ? "calculation_error" : "missing_factor";
    updates.formula = record.formula || "emissions = activityAmount x emissionFactor";
  }

  if (!record.reportingPeriod && !record.reportingPeriodStart) manualReview.push("missing_reporting_period");
  if ((options.force || !record.reportingPeriodStart) && record.reportingPeriod && /^\d{4}-\d{2}$/.test(record.reportingPeriod)) {
    const [year, month] = record.reportingPeriod.split("-").map(Number);
    updates.reportingPeriodStart = new Date(Date.UTC(year, month - 1, 1));
    updates.reportingPeriodEnd = new Date(Date.UTC(year, month, 0));
  }

  const periodSource = updates.reportingPeriodStart || record.reportingPeriodStart || record.occurredAt;
  const periodDate = new Date(periodSource || Date.now());
  if (!Number.isNaN(periodDate.getTime())) {
    const periodMonth = periodDate.getUTCMonth() + 1;
    const periodYear = periodDate.getUTCFullYear();
    if (options.force || record.periodMonth !== periodMonth || record.periodYear !== periodYear) {
      updates.periodMonth = periodMonth;
      updates.periodYear = periodYear;
    }
  }

  if (isMissing(record.archivedAt) && record.dataStatus !== "archived") updates.archivedAt = null;
  if (isMissing(record.archivedBy) && record.dataStatus !== "archived") updates.archivedBy = null;

  if (record.supplierId && (!record.activityData?.supplierName || options.force)) {
    const supplier = await Supplier.findOne({ _id: record.supplierId, companyId: record.companyId }).select("name category country riskLevel").lean();
    if (supplier) {
      updates.activityData = {
        ...(record.activityData || {}),
        supplierName: supplier.name,
        supplierCategory: supplier.category,
        supplierCountry: supplier.country,
        supplierRiskLevel: supplier.riskLevel,
      };
    } else {
      manualReview.push("missing_supplier_snapshot");
    }
  }

  return { updates, manualReview, invalidActivityAmount, missingFactor: !factor };
}

async function runBackfill(options = parseArgs()) {
  const filter = options.companyId ? { companyId: options.companyId } : {};
  const records = await EmissionRecord.find(filter).lean();
  const summary = {
    totalRecordsScanned: records.length,
    recordsNeedingBackfill: 0,
    recordsBackfilled: 0,
    recordsSkipped: 0,
    recordsWithMissingFactors: 0,
    recordsWithInvalidActivityAmount: 0,
    recordsNeedingManualReview: 0,
    recordsWithMissingReportingPeriod: 0,
    recordsWithMissingSupplierSnapshot: 0,
    dryRun: !options.apply,
    force: Boolean(options.force),
  };

  for (const record of records) {
    const result = await buildBackfill(record, options);
    if (result.missingFactor) summary.recordsWithMissingFactors += 1;
    if (result.invalidActivityAmount) summary.recordsWithInvalidActivityAmount += 1;
    if (result.manualReview.length) summary.recordsNeedingManualReview += 1;
    if (result.manualReview.includes("missing_reporting_period")) summary.recordsWithMissingReportingPeriod += 1;
    if (result.manualReview.includes("missing_supplier_snapshot")) summary.recordsWithMissingSupplierSnapshot += 1;
    if (Object.keys(result.updates).length === 0) {
      summary.recordsSkipped += 1;
      continue;
    }
    summary.recordsNeedingBackfill += 1;
    if (options.apply) {
      await EmissionRecord.updateOne({ _id: record._id, companyId: record.companyId }, { $set: result.updates });
      summary.recordsBackfilled += 1;
    }
  }

  return summary;
}

if (require.main === module) {
  connectDB()
    .then(() => runBackfill(parseArgs()))
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
    })
    .finally(() => closeDB())
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  parseArgs,
  buildBackfill,
  runBackfill,
};
