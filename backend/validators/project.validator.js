const { body } = require("express-validator");

const projectValidator = [
  body("name").trim().isLength({ min: 2, max: 160 }).withMessage("Project name is required"),
  body("type").trim().isLength({ min: 2, max: 120 }).withMessage("Project type is required"),
  body("location").trim().isLength({ min: 2, max: 120 }).withMessage("Location is required"),
  body("certification").trim().isLength({ min: 2, max: 120 }).withMessage("Certification is required"),
  body("rating").optional().isFloat({ min: 0, max: 5 }),
  body("pricePerCreditUsd").isFloat({ min: 0 }).withMessage("Price per credit must be a positive number"),
  body("availableCredits").isFloat({ min: 0 }).withMessage("Available credits must be a positive number"),
  body("retiredCredits").optional().isFloat({ min: 0 }),
  body("status").optional().isIn(["DRAFT", "PUBLISHED", "ARCHIVED", "SOLD_OUT", "ACTIVE", "INACTIVE"]),
];

const projectUpdateValidator = [
  body("name").optional().trim().isLength({ min: 2, max: 160 }),
  body("type").optional().trim().isLength({ min: 2, max: 120 }),
  body("location").optional().trim().isLength({ min: 2, max: 120 }),
  body("certification").optional().trim().isLength({ min: 2, max: 120 }),
  body("rating").optional().isFloat({ min: 0, max: 5 }),
  body("pricePerCreditUsd").optional().isFloat({ min: 0 }),
  body("availableCredits").optional().isFloat({ min: 0 }),
  body("retiredCredits").optional().isFloat({ min: 0 }),
  body("status").optional().isIn(["DRAFT", "PUBLISHED", "ARCHIVED", "SOLD_OUT", "ACTIVE", "INACTIVE"]),
];

module.exports = {
  projectValidator,
  projectUpdateValidator,
};
