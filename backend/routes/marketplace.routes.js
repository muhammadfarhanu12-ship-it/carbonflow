const express = require("express");
const { body } = require("express-validator");
const asyncHandler = require("../middleware/asyncHandler");
const validateRequest = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const controller = require("../controllers/marketplace.controller");

const router = express.Router();

router.use(authenticate);
router.get("/", asyncHandler(controller.list));
router.post("/budget/request-increase", [
  body("currentBudgetUsd").isFloat({ min: 0 }),
  body("requestedBudgetUsd").isFloat({ min: 0 }),
  body("remainingBudgetUsd").optional().isFloat({ min: 0 }),
  body("pendingTransactionsUsd").optional().isFloat({ min: 0 }),
  body("companyName").optional().isLength({ min: 2, max: 120 }),
  body("reason").optional().isLength({ max: 600 }),
], validateRequest, asyncHandler(controller.requestBudgetIncrease));
router.post("/", asyncHandler(controller.create));
router.post("/projects", asyncHandler(controller.createManagedProject));
router.put("/:id", asyncHandler(controller.update));
router.patch("/:id/toggle-status", asyncHandler(controller.toggleStatus));
router.patch("/:id/archive", asyncHandler(controller.archive));
router.patch("/:id/deactivate", asyncHandler(controller.deactivate));
router.patch("/:id/sold-out", asyncHandler(controller.markSoldOut));
router.delete("/:id", asyncHandler(controller.remove));
router.post("/:id/buy", asyncHandler(controller.buyCredits));

module.exports = router;
