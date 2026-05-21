const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const { requirePermission } = require("../middlewares/rbac");
const controller = require("../controllers/ledger.controller");

const router = express.Router();

router.use(authenticate);
router.get("/", requirePermission("report:view"), asyncHandler(controller.list));
router.post("/", requirePermission("ledger:financial:create"), asyncHandler(controller.create));
router.put("/:id", requirePermission("ledger:financial:update"), asyncHandler(controller.update));
router.delete("/:id", requirePermission("emission:approve"), asyncHandler(controller.remove));

module.exports = router;
