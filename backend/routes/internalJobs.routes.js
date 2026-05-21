const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { requireCronSecret } = require("../middlewares/cronAuth");
const controller = require("../controllers/internalJobs.controller");

const router = express.Router();

router.post("/jobs/evidence-expiry", requireCronSecret, asyncHandler(controller.runEvidenceExpiryJob));

module.exports = router;
