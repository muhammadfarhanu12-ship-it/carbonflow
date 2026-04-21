const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const controller = require("../controllers/marketplace.controller");

const router = express.Router();

router.use(authenticate);
router.get("/", asyncHandler(controller.list));
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
