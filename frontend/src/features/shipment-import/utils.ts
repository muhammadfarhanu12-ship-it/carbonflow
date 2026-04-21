import type {
  ClientRowIssue,
  ColumnMapping,
  EditableDraftField,
  ImportDefaults,
  ImportField,
  ImportFieldDefinition,
  ImportShipmentDraft,
  MappingTemplate,
  ParsedImportFile,
  ParsedImportRow,
} from "@/src/features/shipment-import/types";
import type {
  ShipmentImportError,
  ShipmentImportRowPayload,
  ShipmentStatus,
  TransportMode,
} from "@/src/types/platform";

export const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const IMPORT_PREVIEW_LIMIT = 50;
export const IMPORT_UPLOAD_CHUNK_SIZE = 500;
export const MAPPING_TEMPLATE_STORAGE_KEY = "carbonflow.shipment-import.templates";

export const IMPORT_FILE_ACCEPT = {
  "text/csv": [".csv"],
  "application/vnd.ms-excel": [".csv", ".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
} as const;

export const TRANSPORT_MODE_OPTIONS: TransportMode[] = ["ROAD", "RAIL", "AIR", "OCEAN"];
export const SHIPMENT_STATUS_OPTIONS: ShipmentStatus[] = ["PLANNED", "IN_TRANSIT", "DELAYED", "DELIVERED"];

export const IMPORT_FIELD_DEFINITIONS: ImportFieldDefinition[] = [
  {
    key: "origin",
    label: "Origin",
    description: "Shipment origin location",
    group: "core",
    required: false,
    type: "string",
  },
  {
    key: "destination",
    label: "Destination",
    description: "Required shipment destination",
    group: "core",
    required: true,
    type: "string",
  },
  {
    key: "weightKg",
    label: "Weight (kg)",
    description: "Required shipment weight in kilograms",
    group: "core",
    required: true,
    type: "number",
  },
  {
    key: "distanceKm",
    label: "Distance (km)",
    description: "Optional route distance",
    group: "core",
    required: false,
    type: "number",
  },
  {
    key: "transportMode",
    label: "Transport Mode",
    description: "Road, Rail, Air, or Ocean",
    group: "core",
    required: false,
    type: "transportMode",
  },
  {
    key: "fuelType",
    label: "Fuel Type",
    description: "Diesel, LNG, Jet Fuel, and similar",
    group: "core",
    required: false,
    type: "string",
  },
  {
    key: "reference",
    label: "Reference",
    description: "Optional shipment reference used for upserts",
    group: "advanced",
    required: false,
    type: "string",
  },
  {
    key: "supplierId",
    label: "Supplier ID",
    description: "Optional supplier UUID",
    group: "advanced",
    required: false,
    type: "string",
  },
  {
    key: "supplierName",
    label: "Supplier Name",
    description: "Optional supplier name fallback",
    group: "advanced",
    required: false,
    type: "string",
  },
  {
    key: "carrier",
    label: "Carrier",
    description: "Carrier or logistics provider",
    group: "advanced",
    required: false,
    type: "string",
  },
  {
    key: "costUsd",
    label: "Cost (USD)",
    description: "Optional shipment cost",
    group: "advanced",
    required: false,
    type: "number",
  },
  {
    key: "status",
    label: "Status",
    description: "Platform shipment status",
    group: "advanced",
    required: false,
    type: "status",
  },
  {
    key: "shipmentDate",
    label: "Shipment Date",
    description: "Optional shipment date",
    group: "advanced",
    required: false,
    type: "date",
  },
  {
    key: "vehicleType",
    label: "Vehicle Type",
    description: "Optional vehicle metadata",
    group: "advanced",
    required: false,
    type: "string",
  },
  {
    key: "notes",
    label: "Notes",
    description: "Optional notes",
    group: "advanced",
    required: false,
    type: "string",
  },
];

const FIELD_SYNONYMS: Record<ImportField, string[]> = {
  origin: ["origin", "from", "pickup", "pickup location", "source", "departure"],
  destination: ["destination", "to", "dropoff", "delivery", "delivery location", "arrival"],
  weightKg: ["weight", "weightkg", "weight kg", "cargo weight", "mass", "load"],
  distanceKm: ["distance", "distancekm", "distance km", "kilometers", "km", "route distance"],
  transportMode: ["transportmode", "transport mode", "mode", "shipping mode"],
  fuelType: ["fueltype", "fuel type", "fuel"],
  reference: ["reference", "shipment reference", "tracking", "tracking number", "shipment id"],
  supplierId: ["supplierid", "supplier id", "vendor id"],
  supplierName: ["supplier", "suppliername", "supplier name", "vendor", "vendor name"],
  carrier: ["carrier", "shipping line", "logistics provider", "operator"],
  costUsd: ["cost", "costusd", "cost usd", "price", "amount", "freight cost"],
  status: ["status", "shipment status"],
  shipmentDate: ["shipmentdate", "shipment date", "date", "departure date"],
  vehicleType: ["vehicletype", "vehicle type", "equipment", "container type"],
  notes: ["notes", "remarks", "comment", "comments", "description"],
};

export const DEFAULT_IMPORT_DEFAULTS: ImportDefaults = {
  supplierName: "Bulk Import Supplier",
  carrier: "Imported Carrier",
  costUsd: 0,
  status: "IN_TRANSIT",
  transportMode: "ROAD",
  originFallback: "Unknown Origin",
  referencePrefix: "IMP",
  fuelType: "",
  vehicleType: "",
  notes: "",
};

export function normalizeHeaderKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function formatFileSize(sizeInBytes: number) {
  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`;
  }

  if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function scoreHeaderMatch(header: string, synonym: string) {
  const normalizedHeader = normalizeHeaderKey(header);
  const normalizedSynonym = normalizeHeaderKey(synonym);

  if (!normalizedHeader || !normalizedSynonym) {
    return 0;
  }

  if (normalizedHeader === normalizedSynonym) {
    return 100;
  }

  if (normalizedHeader.includes(normalizedSynonym) || normalizedSynonym.includes(normalizedHeader)) {
    return 70;
  }

  return 0;
}

export function buildSuggestedMapping(headers: string[]) {
  const mapping: ColumnMapping = {};
  const usedFields = new Set<ImportField>();

  headers.forEach((header) => {
    let bestField: ImportField | "" = "";
    let bestScore = 0;

    IMPORT_FIELD_DEFINITIONS.forEach((fieldDefinition) => {
      FIELD_SYNONYMS[fieldDefinition.key].forEach((synonym) => {
        const score = scoreHeaderMatch(header, synonym);
        if (score > bestScore && (!usedFields.has(fieldDefinition.key) || score >= 100)) {
          bestField = fieldDefinition.key;
          bestScore = score;
        }
      });
    });

    mapping[header] = bestField;
    if (bestField) {
      usedFields.add(bestField);
    }
  });

  return mapping;
}

export function getRequiredImportFields() {
  return IMPORT_FIELD_DEFINITIONS.filter((field) => field.required).map((field) => field.key);
}

export function getDuplicateMappedFields(mapping: ColumnMapping) {
  const counts = new Map<ImportField, number>();

  Object.values(mapping).forEach((field) => {
    if (!field) {
      return;
    }

    counts.set(field, (counts.get(field) || 0) + 1);
  });

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([field]) => field);
}

export function getMissingRequiredMappedFields(mapping: ColumnMapping) {
  const mappedFields = new Set(Object.values(mapping).filter(Boolean) as ImportField[]);
  return getRequiredImportFields().filter((field) => !mappedFields.has(field));
}

export function mapTransportMode(value: string, fallback: TransportMode) {
  const normalized = String(value || "").trim().toUpperCase();

  if (!normalized) {
    return fallback;
  }

  if (normalized === "SEA" || normalized === "SHIP" || normalized === "VESSEL") {
    return "OCEAN";
  }

  if (TRANSPORT_MODE_OPTIONS.includes(normalized as TransportMode)) {
    return normalized as TransportMode;
  }

  return normalized as TransportMode;
}

export function coerceNumber(value: string | number | null | undefined): number | "" {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : "";
}

function sanitizeString(value: string | number | null | undefined) {
  return String(value ?? "").trim();
}

function buildFieldToHeaderMap(mapping: ColumnMapping) {
  return Object.entries(mapping).reduce<Partial<Record<ImportField, string>>>((accumulator, [header, field]) => {
    if (field) {
      accumulator[field] = header;
    }

    return accumulator;
  }, {});
}

function getMappedRawValue(row: ParsedImportRow, fieldToHeaderMap: Partial<Record<ImportField, string>>, field: ImportField) {
  const header = fieldToHeaderMap[field];
  return header ? row.values[header] ?? "" : "";
}

export function validateImportDraftRow(row: Omit<ImportShipmentDraft, "clientErrors">) {
  const issues: ClientRowIssue[] = [];

  if (row.malformedMessages.length > 0) {
    row.malformedMessages.forEach((message) => {
      issues.push({
        rowIndex: row.rowIndex,
        field: "row",
        message,
      });
    });
  }

  if (!sanitizeString(row.destination)) {
    issues.push({
      rowIndex: row.rowIndex,
      field: "destination",
      message: "Destination is required",
    });
  }

  if (row.weightKg === "" || Number(row.weightKg) <= 0) {
    issues.push({
      rowIndex: row.rowIndex,
      field: "weightKg",
      message: "Weight must be a number greater than 0",
    });
  }

  if (row.distanceKm !== "" && Number(row.distanceKm) < 0) {
    issues.push({
      rowIndex: row.rowIndex,
      field: "distanceKm",
      message: "Distance cannot be negative",
    });
  }

  if (row.costUsd !== "" && Number(row.costUsd) < 0) {
    issues.push({
      rowIndex: row.rowIndex,
      field: "costUsd",
      message: "Cost cannot be negative",
    });
  }

  if (!TRANSPORT_MODE_OPTIONS.includes(row.transportMode)) {
    issues.push({
      rowIndex: row.rowIndex,
      field: "transportMode",
      message: "Transport mode must be Road, Rail, Air, or Ocean",
    });
  }

  return issues;
}

export function buildImportDraftsForRows(
  rows: ParsedImportRow[],
  headers: string[],
  mapping: ColumnMapping,
  defaults: ImportDefaults,
) {
  const fieldToHeaderMap = buildFieldToHeaderMap(mapping);
  const today = new Date().toISOString().slice(0, 10);

  return rows.map((row) => {
    const transportMode = mapTransportMode(
      getMappedRawValue(row, fieldToHeaderMap, "transportMode"),
      defaults.transportMode,
    );
    const draftBase = {
      rowIndex: row.rowIndex,
      origin: sanitizeString(getMappedRawValue(row, fieldToHeaderMap, "origin")) || defaults.originFallback,
      destination: sanitizeString(getMappedRawValue(row, fieldToHeaderMap, "destination")),
      weightKg: coerceNumber(getMappedRawValue(row, fieldToHeaderMap, "weightKg")),
      distanceKm: coerceNumber(getMappedRawValue(row, fieldToHeaderMap, "distanceKm")),
      transportMode,
      fuelType: sanitizeString(getMappedRawValue(row, fieldToHeaderMap, "fuelType")) || defaults.fuelType,
      reference: sanitizeString(getMappedRawValue(row, fieldToHeaderMap, "reference"))
        || `${defaults.referencePrefix}-${String(row.rowIndex).padStart(6, "0")}`,
      supplierId: sanitizeString(getMappedRawValue(row, fieldToHeaderMap, "supplierId")),
      supplierName: sanitizeString(getMappedRawValue(row, fieldToHeaderMap, "supplierName")) || defaults.supplierName,
      carrier: sanitizeString(getMappedRawValue(row, fieldToHeaderMap, "carrier")) || defaults.carrier,
      costUsd: (() => {
        const rawCost = coerceNumber(getMappedRawValue(row, fieldToHeaderMap, "costUsd"));
        return rawCost === "" ? defaults.costUsd : rawCost;
      })(),
      status: (() => {
        const rawStatus = sanitizeString(getMappedRawValue(row, fieldToHeaderMap, "status")).toUpperCase();
        return SHIPMENT_STATUS_OPTIONS.includes(rawStatus as ShipmentStatus)
          ? rawStatus as ShipmentStatus
          : defaults.status;
      })(),
      shipmentDate: sanitizeString(getMappedRawValue(row, fieldToHeaderMap, "shipmentDate")) || today,
      vehicleType: sanitizeString(getMappedRawValue(row, fieldToHeaderMap, "vehicleType")) || defaults.vehicleType,
      notes: sanitizeString(getMappedRawValue(row, fieldToHeaderMap, "notes")) || defaults.notes,
      rawData: row.values,
      malformedMessages: row.malformedMessages,
    };

    return {
      ...draftBase,
      clientErrors: validateImportDraftRow(draftBase),
    };
  });
}

export function buildImportDrafts(parsedFile: ParsedImportFile, mapping: ColumnMapping, defaults: ImportDefaults) {
  return buildImportDraftsForRows(parsedFile.rows, parsedFile.headers, mapping, defaults);
}

export function updateDraftValue(
  row: ImportShipmentDraft,
  field: EditableDraftField,
  nextValue: string,
) {
  const updatedRowBase: Omit<ImportShipmentDraft, "clientErrors"> = {
    ...row,
  };

  switch (field) {
    case "weightKg":
    case "distanceKm":
    case "costUsd":
      updatedRowBase[field] = coerceNumber(nextValue);
      break;
    case "transportMode":
      updatedRowBase.transportMode = mapTransportMode(nextValue, "ROAD");
      break;
    default:
      updatedRowBase[field] = nextValue;
      break;
  }

  return {
    ...updatedRowBase,
    clientErrors: validateImportDraftRow(updatedRowBase),
  };
}

export function buildClientIssueMap(rows: ImportShipmentDraft[]) {
  return rows.reduce<Record<number, ClientRowIssue[]>>((accumulator, row) => {
    accumulator[row.rowIndex] = row.clientErrors;
    return accumulator;
  }, {});
}

export function getPreviewRows(rows: ImportShipmentDraft[], onlyInvalidRows: boolean) {
  const scopedRows = onlyInvalidRows
    ? rows.filter((row) => row.clientErrors.length > 0)
    : rows;

  return scopedRows.slice(0, IMPORT_PREVIEW_LIMIT);
}

export function getHeaderSampleValues(parsedFile: ParsedImportFile) {
  return parsedFile.headers.reduce<Record<string, string>>((accumulator, header) => {
    const sampleValue = parsedFile.rows.find((row) => sanitizeString(row.values[header]));
    accumulator[header] = sampleValue?.values[header] || "";
    return accumulator;
  }, {});
}

export function readMappingTemplates() {
  if (typeof window === "undefined") {
    return [] as MappingTemplate[];
  }

  try {
    const rawValue = window.localStorage.getItem(MAPPING_TEMPLATE_STORAGE_KEY);
    if (!rawValue) {
      return [] as MappingTemplate[];
    }

    const parsedValue = JSON.parse(rawValue) as MappingTemplate[];
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [] as MappingTemplate[];
  }
}

export function writeMappingTemplates(templates: MappingTemplate[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(MAPPING_TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
}

export function buildTemplateSignature(headers: string[]) {
  return headers.map((header) => normalizeHeaderKey(header)).sort().join("|");
}

export function buildImportPayloadRows(rows: ImportShipmentDraft[]): ShipmentImportRowPayload[] {
  return rows.map((row) => ({
    rowIndex: row.rowIndex,
    origin: row.origin,
    destination: row.destination,
    weightKg: row.weightKg === "" ? "" : Number(row.weightKg),
    distanceKm: row.distanceKm === "" ? 0 : Number(row.distanceKm),
    transportMode: row.transportMode,
    fuelType: row.fuelType,
    reference: row.reference,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    carrier: row.carrier,
    costUsd: row.costUsd === "" ? 0 : Number(row.costUsd),
    status: row.status,
    shipmentDate: row.shipmentDate,
    vehicleType: row.vehicleType,
    notes: row.notes,
    rawData: row.rawData,
  }));
}

export function buildErrorReportCsv(errors: ShipmentImportError[], rows: ImportShipmentDraft[]) {
  const rowMap = new Map(rows.map((row) => [row.rowIndex, row]));
  const baseHeaders = ["rowIndex", "field", "message", "reference", "origin", "destination", "weightKg", "distanceKm", "transportMode"];

  const escapeCsv = (value: unknown) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;

  return [
    baseHeaders.join(","),
    ...errors.map((error) => {
      const row = rowMap.get(error.rowIndex);
      return [
        error.rowIndex,
        error.field,
        error.message,
        row?.reference || "",
        row?.origin || "",
        row?.destination || "",
        row?.weightKg ?? "",
        row?.distanceKm ?? "",
        row?.transportMode || "",
      ].map(escapeCsv).join(",");
    }),
  ].join("\n");
}

export function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
