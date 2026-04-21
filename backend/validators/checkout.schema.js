const Joi = require("joi");

const startCheckoutSchema = Joi.object({
  companyName: Joi.string().trim().min(2).max(200).required(),
  projectId: Joi.string().trim().guid({ version: ["uuidv4", "uuidv5"] }).required(),
  shipmentId: Joi.string().trim().guid({ version: ["uuidv4", "uuidv5"] }).allow(null).default(null),
  shipmentIds: Joi.array().items(
    Joi.string().trim().guid({ version: ["uuidv4", "uuidv5"] }),
  ).unique().max(100).default([]),
  quantity: Joi.number().positive().required(),
  idempotencyKey: Joi.string().trim().min(8).max(120).allow(null).default(null),
}).required();

const completeCheckoutSchema = Joi.object({
  transactionId: Joi.string().trim().guid({ version: ["uuidv4", "uuidv5"] }).required(),
}).required();

module.exports = {
  startCheckoutSchema,
  completeCheckoutSchema,
};
