const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const { importRateLimiter } = require("../middlewares/rateLimiter");
const { hasPermission, requireAnyPermission, requirePermission } = require("../middlewares/rbac");
const controller = require("../controllers/import.controller");
const workflowController = require("../controllers/importWorkflow.controller");

const router = express.Router();

const IMPORT_TYPE_PERMISSION = {
  shipment: "shipment:import",
  emission_activity: "emission:create",
  supplier: "supplier:create",
  emission_factor: "factor:manage",
  financial_ledger: "ledger:financial:create",
};

function requireImportCreateForType(req, res, next) {
  const modulePermission = IMPORT_TYPE_PERMISSION[String(req.params.type || "").trim()];
  if (hasPermission(req.user, "import:create") || (modulePermission && hasPermission(req.user, modulePermission))) return next();
  return requirePermission("import:create")(req, res, next);
}

function requireImportCommitForType(req, res, next) {
  const modulePermission = IMPORT_TYPE_PERMISSION[String(req.params.type || "").trim()];
  if (hasPermission(req.user, "import:commit") || hasPermission(req.user, "import:create") || (modulePermission && hasPermission(req.user, modulePermission))) return next();
  return requirePermission("import:commit")(req, res, next);
}

function requireLegacyShipmentImport(req, res, next) {
  req.params.type = "shipment";
  return requireImportCommitForType(req, res, next);
}

router.use(authenticate);
router.use(importRateLimiter);

router.get("/imports", requirePermission("import:view"), asyncHandler(workflowController.list));
router.get("/imports/templates/:type", requirePermission("import:view"), asyncHandler(workflowController.template));
router.get("/imports/:id", requirePermission("import:view"), asyncHandler(workflowController.get));
router.get("/imports/:id/errors", requirePermission("import:view"), asyncHandler(workflowController.errors));
router.get("/imports/:id/error-report", requireAnyPermission(["import:error_report:download", "import:view"]), asyncHandler(workflowController.errorReport));
router.get("/imports/:type/template", requirePermission("import:view"), asyncHandler(workflowController.template));
router.post("/imports/:type/preview", requireImportCreateForType, asyncHandler(workflowController.preview));
router.post("/imports/:id/commit", requireAnyPermission(["import:commit", "import:create"]), asyncHandler(workflowController.commitById));
router.post("/imports/:type/commit", requireImportCommitForType, asyncHandler(workflowController.commit));
router.post("/import", requireLegacyShipmentImport, asyncHandler(controller.importShipments));

module.exports = router;
