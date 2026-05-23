const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const { importRateLimiter } = require("../middlewares/rateLimiter");
const { requirePermission } = require("../middlewares/rbac");
const controller = require("../controllers/import.controller");
const workflowController = require("../controllers/importWorkflow.controller");

const router = express.Router();

router.use(authenticate);
router.use(importRateLimiter);

router.get("/imports", requirePermission("import:view"), asyncHandler(workflowController.list));
router.get("/imports/:id", requirePermission("import:view"), asyncHandler(workflowController.get));
router.get("/imports/:id/errors", requirePermission("import:view"), asyncHandler(workflowController.errors));
router.get("/imports/:type/template", requirePermission("import:view"), asyncHandler(workflowController.template));
router.post("/imports/:type/preview", requirePermission("import:create"), asyncHandler(workflowController.preview));
router.post("/imports/:type/commit", requirePermission("import:create"), asyncHandler(workflowController.commit));
router.post("/import", asyncHandler(controller.importShipments));

module.exports = router;
