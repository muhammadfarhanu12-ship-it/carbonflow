const SupplierScheduledJobsService = require("../services/supplierScheduledJobs.service");
const { sendSuccess } = require("../utils/apiResponse");

exports.runEvidenceExpiryJob = async (_req, res) => {
  return sendSuccess(res, {
    message: "Evidence expiry job completed",
    data: await SupplierScheduledJobsService.runEvidenceExpiryJob(),
  });
};
