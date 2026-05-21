const EmissionRecordService = require("./emissionRecord.service");
const { calculateActivityEmission } = require("./carbonEngine");

const TEMPLATE_COLUMNS = [
  "scope",
  "category",
  "activityType",
  "activityAmount",
  "activityUnit",
  "factorKey",
  "reportingPeriodStart",
  "reportingPeriodEnd",
  "activityDate",
  "facility",
  "businessUnit",
  "country",
  "region",
  "supplier",
  "notes",
];

const REQUIRED_COLUMNS = [
  "scope",
  "category",
  "activityType",
  "activityAmount",
  "activityUnit",
  "reportingPeriodStart",
  "reportingPeriodEnd",
];

const DEFAULT_FACTOR_KEYS_BY_ACTIVITY = {
  stationary_fuel: "DIESEL",
  mobile_fuel: "DIESEL",
  fleet_distance: "DIESEL",
  electricity: "GLOBAL",
  purchased_heat: "GLOBAL",
  business_travel_air: "BUSINESS_TRAVEL_AIR_KM",
  employee_commuting_car: "EMPLOYEE_COMMUTING_CAR_KM",
  purchased_goods_services: "PURCHASED_GOODS_USD",
  capital_goods: "CAPITAL_GOODS_USD",
  waste_landfill: "WASTE_LANDFILL_KG",
  upstream_transportation: "UPSTREAM_TRANSPORTATION_TON_KM",
  downstream_transportation: "DOWNSTREAM_TRANSPORTATION_TON_KM",
  fuel_energy_related: "FUEL_ENERGY_RELATED_KWH",
};

function parseCsv(csv = "") {
  const lines = String(csv || "").split(/\r?\n/).filter((line) => line.trim());
  const [headerLine, ...dataLines] = lines;
  if (!headerLine) return [];
  const headers = parseCsvLine(headerLine).map((header) => header.trim());
  return dataLines.map((line) => {
    const values = parseCsvLine(line).map((value) => value.trim());
    return headers.reduce((row, header, index) => {
      row[header] = values[index] || "";
      return row;
    }, {});
  });
}

function parseCsvLine(line = "") {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === "\"" && inQuotes && nextChar === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function isValidDate(value) {
  const raw = String(value || "").trim();
  const date = new Date(raw);
  return Boolean(raw) && !Number.isNaN(date.getTime());
}

function toReportingPeriod(start, end, fallback = "") {
  const startValue = String(start || "").trim();
  const endValue = String(end || "").trim();
  if (startValue && endValue) return `${startValue}/${endValue}`;
  return fallback;
}

function inferFactorKey(row = {}) {
  const explicit = row.factorKey || row.fuelType;
  if (explicit) return explicit;
  return DEFAULT_FACTOR_KEYS_BY_ACTIVITY[String(row.activityType || "").trim().toLowerCase()] || null;
}

class EmissionImportService {
  static getTemplate() {
    return [
      TEMPLATE_COLUMNS.join(","),
      "1,Stationary combustion,stationary_fuel,100,liter,DIESEL,2026-05-01,2026-05-31,2026-05-15,Plant A,Operations,US,GLOBAL,Acme Fuels,Boiler diesel use",
      "2,Purchased electricity,electricity,1000,kWh,GLOBAL,2026-05-01,2026-05-31,2026-05-15,HQ,Operations,US,GLOBAL,Utility Provider,Grid electricity",
      "3,Business travel,business_travel_air,1500,km,BUSINESS_TRAVEL_AIR_KM,2026-05-01,2026-05-31,2026-05-20,HQ,Sales,US,GLOBAL,Travel Vendor,Flight travel",
    ].join("\n");
  }

  static async preview(csv, companyId) {
    const rows = parseCsv(csv);
    const results = [];
    const headerErrors = [];
    const headers = String(csv || "").split(/\r?\n/).find((line) => line.trim());
    const headerSet = new Set(parseCsvLine(headers || "").map((header) => header.trim()));
    REQUIRED_COLUMNS.forEach((column) => {
      if (!headerSet.has(column)) headerErrors.push(`${column} column is required`);
    });

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const errors = [...headerErrors];
      const legacyReportingPeriod = row.reportingPeriod || "";
      const payload = {
        scope: Number(row.scope),
        category: row.category,
        activityType: row.activityType,
        activityAmount: Number(row.activityAmount),
        activityUnit: row.activityUnit,
        factorKey: inferFactorKey(row),
        reportingPeriod: toReportingPeriod(row.reportingPeriodStart, row.reportingPeriodEnd, legacyReportingPeriod),
        reportingPeriodStart: row.reportingPeriodStart || null,
        reportingPeriodEnd: row.reportingPeriodEnd || null,
        fuelType: row.fuelType || row.factorKey || null,
        occurredAt: row.activityDate || row.occurredAt || row.reportingPeriodStart || null,
        activityDate: row.activityDate || row.occurredAt || row.reportingPeriodStart || null,
        facilityName: row.facility || row.facilityName || null,
        businessUnit: row.businessUnit || null,
        country: row.country || null,
        region: row.region || "GLOBAL",
        supplier: row.supplier || row.supplierName || null,
        supplierName: row.supplier || row.supplierName || null,
        description: row.notes || row.description || null,
        notes: row.notes || null,
      };

      if (![1, 2, 3].includes(payload.scope)) errors.push("scope must be 1, 2, or 3");
      if (!row.category) errors.push("category is required");
      if (!row.activityAmount) errors.push("activityAmount is required");
      if (!Number.isFinite(payload.activityAmount)) errors.push("activityAmount must be a number");
      if (Number.isFinite(payload.activityAmount) && payload.activityAmount <= 0) errors.push("activityAmount must be greater than 0");
      if (!row.activityUnit) errors.push("activityUnit is required");
      if (!payload.factorKey) errors.push("factorKey is required");
      if (!isValidDate(payload.activityDate)) errors.push("activityDate must be a valid date");
      if (!isValidDate(row.reportingPeriodStart)) errors.push("reportingPeriodStart must be a valid date");
      if (!isValidDate(row.reportingPeriodEnd)) errors.push("reportingPeriodEnd must be a valid date");
      if (isValidDate(row.reportingPeriodStart) && isValidDate(row.reportingPeriodEnd) && new Date(row.reportingPeriodEnd) < new Date(row.reportingPeriodStart)) {
        errors.push("reportingPeriodEnd must be on or after reportingPeriodStart");
      }

      let factor = null;
      let calculation = null;
      if (errors.length === 0) {
        factor = await EmissionRecordService.resolveActivityFactor({ ...payload, companyId });
        if (!factor) errors.push("No matching emission factor found");
        if (factor) calculation = calculateActivityEmission(payload, factor);
      }

      results.push({
        rowNumber: index + 2,
        valid: errors.length === 0,
        errors,
        payload,
        factor: factor ? {
          id: factor._id || factor.id || null,
          name: factor.name,
          factorValue: factor.factorValue ?? factor.value,
          factorUnit: factor.factorUnit,
          sourceName: factor.sourceName || factor.source,
          sourceYear: factor.sourceYear,
          isSample: factor.isSample !== false,
        } : null,
        calculation,
      });
    }

    const validRows = results.filter((row) => row.valid);
    const invalidRows = results.filter((row) => !row.valid);
    return {
      totalRows: rows.length,
      validRows: validRows.length,
      invalidRows: invalidRows.length,
      missingFactorRows: results.filter((row) => row.errors.some((error) => /factor/i.test(error))).length,
      sampleFactorRows: results.filter((row) => row.factor?.isSample).length,
      estimatedKgCo2e: Number(results.reduce((sum, row) => sum + Number(row.calculation?.emissionsKgCo2e || 0), 0).toFixed(4)),
      estimatedTCo2e: Number(results.reduce((sum, row) => sum + Number(row.calculation?.emissionsTCo2e || 0), 0).toFixed(4)),
      validRowItems: validRows,
      invalidRowItems: invalidRows,
      rows: results,
    };
  }

  static async commit(csv, companyId, actor = null) {
    const preview = await this.preview(csv, companyId);
    const validRows = preview.rows.filter((row) => row.valid);
    const created = [];

    for (const row of validRows) {
      created.push(await EmissionRecordService.createActivity(companyId, {
        ...row.payload,
        dataStatus: "submitted",
      }, actor));
    }

    return {
      ...preview,
      createdCount: created.length,
      createdRecords: created,
    };
  }
}

module.exports = EmissionImportService;
