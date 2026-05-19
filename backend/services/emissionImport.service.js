const EmissionRecordService = require("./emissionRecord.service");
const { calculateActivityEmission } = require("./carbonEngine");

const REQUIRED_COLUMNS = [
  "scope",
  "category",
  "activityType",
  "activityAmount",
  "activityUnit",
  "reportingPeriodStart",
  "reportingPeriodEnd",
  "facility",
  "businessUnit",
  "country",
  "notes",
];

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

class EmissionImportService {
  static getTemplate() {
    return [
      REQUIRED_COLUMNS.concat(["fuelType"]).join(","),
      "1,Stationary combustion,stationary_fuel,100,liter,2026-05-01,2026-05-31,Plant A,Operations,US,Boiler diesel use,DIESEL",
      "2,Purchased electricity,electricity,1000,kWh,2026-05-01,2026-05-31,HQ,Operations,US,Grid electricity,GLOBAL",
      "3,Business travel,business_travel_air,1500,km,2026-05-01,2026-05-31,HQ,Sales,US,Flight travel,BUSINESS_TRAVEL_AIR_KM",
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
        reportingPeriod: toReportingPeriod(row.reportingPeriodStart, row.reportingPeriodEnd, legacyReportingPeriod),
        reportingPeriodStart: row.reportingPeriodStart || null,
        reportingPeriodEnd: row.reportingPeriodEnd || null,
        fuelType: row.fuelType || row.factorKey || null,
        occurredAt: row.reportingPeriodStart || row.occurredAt || null,
        facilityName: row.facility || row.facilityName || null,
        businessUnit: row.businessUnit || null,
        country: row.country || null,
        description: row.notes || row.description || null,
        notes: row.notes || null,
      };

      if (![1, 2, 3].includes(payload.scope)) errors.push("scope must be 1, 2, or 3");
      if (!row.category) errors.push("category is required");
      if (!row.activityAmount) errors.push("activityAmount is required");
      if (!Number.isFinite(payload.activityAmount)) errors.push("activityAmount must be a number");
      if (Number.isFinite(payload.activityAmount) && payload.activityAmount < 0) errors.push("activityAmount must be zero or greater");
      if (!row.activityUnit) errors.push("activityUnit is required");
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
