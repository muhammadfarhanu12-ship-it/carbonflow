const Joi = require("joi");
const { SUPPLIER_SCORING_CONFIG } = require("../config/supplierScoring");

const supplierScoreSchema = Joi.object({
  id: Joi.string().trim().allow("").max(120).default(""),
  name: Joi.string().trim().min(2).required(),
  totalEmissions: Joi.number().min(0).allow(null).default(null),
  revenue: Joi.number().min(0).allow(null).default(null),
  emissionIntensity: Joi.number().min(0).allow(null).default(null),
  emissionFactor: Joi.number().min(0).allow(null).default(null),
  hasISO14001: Joi.boolean().default(false),
  hasSBTi: Joi.boolean().default(false),
  dataTransparencyScore: Joi.number().min(0).max(100).default(0),
  complianceScore: Joi.number().min(0).max(100).allow(null).default(null),
  lastReportedAt: Joi.date().iso().allow(null).default(null),
  createdAt: Joi.date().iso().default(() => new Date()),
  updatedAt: Joi.date().iso().default(() => new Date()),
  industry: Joi.string().trim().allow("").allow(null).max(120).default(""),
  category: Joi.string().trim().allow("").allow(null).max(120).default(""),
  country: Joi.string().trim().allow("").allow(null).max(80).default(""),
  region: Joi.string().trim().allow("").allow(null).max(120).default(""),
}).unknown(true);

const supplierBulkScoreSchema = Joi.alternatives().try(
  Joi.array()
    .items(supplierScoreSchema)
    .min(1)
    .max(SUPPLIER_SCORING_CONFIG.bulkProcessing.maxSuppliers)
    .required(),
  Joi.object({
    suppliers: Joi.array()
      .items(supplierScoreSchema)
      .min(1)
      .max(SUPPLIER_SCORING_CONFIG.bulkProcessing.maxSuppliers)
      .required(),
  }).required(),
);

module.exports = {
  supplierScoreSchema,
  supplierBulkScoreSchema,
};
