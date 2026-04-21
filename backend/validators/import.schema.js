const Joi = require("joi");
const { SHIPMENT_STATUSES, TRANSPORT_MODES } = require("../constants/platform");

const MAX_ROWS_PER_REQUEST = 1000;

const importRowSchema = Joi.object({
  rowIndex: Joi.number().integer().min(2).required(),
  origin: Joi.string().trim().allow("").max(200).default(""),
  destination: Joi.string().trim().required(),
  weightKg: Joi.number().positive().required(),
  distanceKm: Joi.number().min(0).default(0),
  transportMode: Joi.string().trim().uppercase().valid(...TRANSPORT_MODES).default("ROAD"),
  fuelType: Joi.string().trim().allow("").allow(null).default(""),
  reference: Joi.string().trim().allow("").allow(null).max(120).default(""),
  supplierId: Joi.string().trim().guid({ version: ["uuidv4", "uuidv5"] }).allow("").allow(null).default(""),
  supplierName: Joi.string().trim().allow("").allow(null).max(160).default(""),
  carrier: Joi.string().trim().allow("").allow(null).max(160).default(""),
  costUsd: Joi.number().min(0).default(0),
  status: Joi.string().trim().uppercase().valid(...SHIPMENT_STATUSES).default("IN_TRANSIT"),
  shipmentDate: Joi.date().iso().allow("").allow(null).default(null),
  vehicleType: Joi.string().trim().allow("").allow(null).max(120).default(""),
  notes: Joi.string().trim().allow("").allow(null).max(2000).default(""),
  rawData: Joi.object().pattern(Joi.string(), Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean(), Joi.valid(null))).default({}),
}).unknown(false);

const importRequestSchema = Joi.object({
  shipments: Joi.array().items(Joi.object().required()).min(1).max(MAX_ROWS_PER_REQUEST).required(),
  metadata: Joi.object({
    source: Joi.string().valid("csv", "excel").required(),
    totalRows: Joi.number().integer().min(1).required(),
    fileName: Joi.string().trim().allow("").allow(null).max(260).default(""),
    uploadId: Joi.string().trim().allow("").allow(null).max(120).default(""),
    batchIndex: Joi.number().integer().min(0).default(0),
    totalBatches: Joi.number().integer().min(1).default(1),
    templateName: Joi.string().trim().allow("").allow(null).max(120).default(""),
  }).required(),
}).required();

module.exports = {
  MAX_ROWS_PER_REQUEST,
  importRequestSchema,
  importRowSchema,
};
