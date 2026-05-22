const express = require("express");
const { body } = require("express-validator");
const asyncHandler = require("../middleware/asyncHandler");
const validateRequest = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const { requirePermission } = require("../middlewares/rbac");
const controller = require("../controllers/marketplace.controller");
const checkoutController = require("../controllers/credits.controller");

const router = express.Router();

router.use(authenticate);
router.get("/", requirePermission("marketplace:view"), asyncHandler(controller.list));
router.get("/listings", requirePermission("marketplace:view"), asyncHandler(controller.list));
router.get("/budget", requirePermission("marketplace:view"), asyncHandler(controller.getBudget));
router.patch("/budget", requirePermission("marketplace:budget:manage"), asyncHandler(controller.updateBudget));
router.get("/budget/requests", requirePermission("marketplace:view"), asyncHandler(controller.getBudgetRequests));
router.get("/budget/requests/:requestId", requirePermission("marketplace:view"), asyncHandler(controller.getBudgetRequest));
router.patch("/budget/requests/:requestId/approve", requirePermission("marketplace:budget:manage"), asyncHandler(controller.approveBudgetRequest));
router.patch("/budget/requests/:requestId/reject", requirePermission("marketplace:budget:manage"), asyncHandler(controller.rejectBudgetRequest));
router.patch("/budget/requests/:requestId/cancel", requirePermission("marketplace:budget:request"), asyncHandler(controller.cancelBudgetRequest));
router.post("/budget/request-increase", [
  body("currentBudgetUsd").isFloat({ min: 0 }),
  body("requestedBudgetUsd").isFloat({ min: 0 }),
  body("remainingBudgetUsd").optional().isFloat({ min: 0 }),
  body("pendingTransactionsUsd").optional().isFloat({ min: 0 }),
  body("companyName").optional().isLength({ min: 2, max: 120 }),
  body("reason").optional().isLength({ max: 600 }),
], validateRequest, requirePermission("marketplace:budget:request"), asyncHandler(controller.requestBudgetIncrease));
router.get("/auto-offset-rule", requirePermission("marketplace:view"), asyncHandler(controller.getAutoOffsetRule));
router.patch("/auto-offset-rule", requirePermission("marketplace:auto_offset:manage"), asyncHandler(controller.updateAutoOffsetRule));
router.post("/auto-offset-rule/evaluate", requirePermission("marketplace:auto_offset:manage"), asyncHandler(controller.evaluateAutoOffsetRule));
router.post("/checkout", requirePermission("marketplace:checkout"), asyncHandler(checkoutController.checkout));
router.get("/operations/review", requirePermission("marketplace:view"), asyncHandler(controller.getOperationalReview));
router.post("/transactions/:id/submit-retirement", requirePermission("marketplace:manage"), asyncHandler(controller.submitRetirement));
router.patch("/transactions/:id/manual-retirement", requirePermission("marketplace:manage"), asyncHandler(controller.manualRetirement));
router.get("/transactions/:id/retirement-status", requirePermission("marketplace:view"), asyncHandler(controller.getRetirementStatus));
router.post("/transactions/:id/create-invoice", requirePermission("marketplace:manage"), asyncHandler(controller.createInvoice));
router.patch("/transactions/:id/mark-paid", requirePermission("marketplace:manage"), asyncHandler(controller.markPaid));
router.patch("/transactions/:id/mark-failed", requirePermission("marketplace:manage"), asyncHandler(controller.markPaymentFailed));
router.patch("/transactions/:id/cancel", requirePermission("marketplace:manage"), asyncHandler(controller.cancelPayment));
router.patch("/transactions/:id/refund", requirePermission("marketplace:manage"), asyncHandler(controller.refund));
router.get("/transactions/:id/payment-status", requirePermission("marketplace:view"), asyncHandler(controller.getPaymentStatus));
router.post("/", requirePermission("marketplace:manage"), asyncHandler(controller.create));
router.post("/listings", requirePermission("marketplace:manage"), asyncHandler(controller.createManagedProject));
router.post("/projects", requirePermission("marketplace:manage"), asyncHandler(controller.createManagedProject));
router.get("/listings/:id", requirePermission("marketplace:view"), asyncHandler(controller.getById));
router.put("/:id", requirePermission("marketplace:manage"), asyncHandler(controller.update));
router.patch("/listings/:id", requirePermission("marketplace:manage"), asyncHandler(controller.update));
router.patch("/listings/:id/inventory", requirePermission("marketplace:manage"), asyncHandler(controller.adjustInventory));
router.patch("/:id/toggle-status", requirePermission("marketplace:manage"), asyncHandler(controller.toggleStatus));
router.patch("/:id/publish", requirePermission("marketplace:manage"), asyncHandler(controller.publish));
router.patch("/listings/:id/publish", requirePermission("marketplace:manage"), asyncHandler(controller.publish));
router.patch("/:id/pause", requirePermission("marketplace:manage"), asyncHandler(controller.pause));
router.patch("/listings/:id/pause", requirePermission("marketplace:manage"), asyncHandler(controller.pause));
router.patch("/:id/archive", requirePermission("marketplace:manage"), asyncHandler(controller.archive));
router.patch("/listings/:id/archive", requirePermission("marketplace:manage"), asyncHandler(controller.archive));
router.patch("/:id/deactivate", requirePermission("marketplace:manage"), asyncHandler(controller.deactivate));
router.patch("/:id/sold-out", requirePermission("marketplace:manage"), asyncHandler(controller.markSoldOut));
router.delete("/:id", requirePermission("marketplace:manage"), asyncHandler(controller.remove));
router.post("/:id/buy", requirePermission("marketplace:checkout"), asyncHandler(controller.buyCredits));

module.exports = router;
