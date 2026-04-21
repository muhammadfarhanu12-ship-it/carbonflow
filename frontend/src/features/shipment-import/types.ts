import type { ShipmentStatus, TransportMode } from "@/src/types/platform";

export type ImportFileSource = "csv" | "excel";

export type ImportField =
  | "origin"
  | "destination"
  | "weightKg"
  | "distanceKm"
  | "transportMode"
  | "fuelType"
  | "reference"
  | "supplierId"
  | "supplierName"
  | "carrier"
  | "costUsd"
  | "status"
  | "shipmentDate"
  | "vehicleType"
  | "notes";

export type ImportFieldGroup = "core" | "advanced";
export type ImportFieldType = "string" | "number" | "transportMode" | "status" | "date";

export interface ImportFieldDefinition {
  key: ImportField;
  label: string;
  description: string;
  group: ImportFieldGroup;
  required: boolean;
  type: ImportFieldType;
}

export type ColumnMapping = Record<string, ImportField | "">;

export interface ImportDefaults {
  supplierName: string;
  carrier: string;
  costUsd: number;
  status: ShipmentStatus;
  transportMode: TransportMode;
  originFallback: string;
  referencePrefix: string;
  fuelType: string;
  vehicleType: string;
  notes: string;
}

export interface MappingTemplate {
  id: string;
  name: string;
  mapping: ColumnMapping;
  defaults: ImportDefaults;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedImportRow {
  rowIndex: number;
  values: Record<string, string>;
  malformedMessages: string[];
}

export interface ParsedImportFile {
  source: ImportFileSource;
  fileName: string;
  headers: string[];
  rows: ParsedImportRow[];
}

export interface ClientRowIssue {
  rowIndex: number;
  field: ImportField | "row";
  message: string;
}

export interface ImportShipmentDraft {
  rowIndex: number;
  origin: string;
  destination: string;
  weightKg: number | "";
  distanceKm: number | "";
  transportMode: TransportMode;
  fuelType: string;
  reference: string;
  supplierId: string;
  supplierName: string;
  carrier: string;
  costUsd: number | "";
  status: ShipmentStatus;
  shipmentDate: string;
  vehicleType: string;
  notes: string;
  rawData: Record<string, string>;
  malformedMessages: string[];
  clientErrors: ClientRowIssue[];
}

export type EditableDraftField =
  | "origin"
  | "destination"
  | "weightKg"
  | "distanceKm"
  | "transportMode"
  | "fuelType"
  | "reference"
  | "supplierName"
  | "carrier"
  | "costUsd";
