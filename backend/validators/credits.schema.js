const Joi = require("joi");

const currentYear = new Date().getUTCFullYear();

const checkoutSchema = Joi.object({
  companyName: Joi.string().trim().min(2).max(200).required(),
  projectId: Joi.string().trim().guid({ version: ["uuidv4", "uuidv5"] }).allow(null).default(null),
  projectName: Joi.string().trim().min(2).max(200).required(),
  registry: Joi.string().trim().min(2).max(120).required(),
  vintageYear: Joi.number().integer().min(2000).max(currentYear + 1).required(),
  pricePerTon: Joi.number().positive().required(),
  quantity: Joi.number().positive().required(),
  idempotencyKey: Joi.string().trim().min(8).max(120).allow(null).default(null),
  simulateFailure: Joi.boolean().default(false),
}).required();

module.exports = {
  checkoutSchema,
};
