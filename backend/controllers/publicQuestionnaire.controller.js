const { SupplierQuestionnaireService } = require("../services/supplierQuestionnaire.service");
const { sendSuccess } = require("../utils/apiResponse");

function requestMeta(req) {
  return {
    ipAddress: req.ip || req.headers?.["x-forwarded-for"] || null,
    userAgent: req.headers?.["user-agent"] || null,
  };
}

exports.getQuestionnaire = async (req, res) => {
  return sendSuccess(res, {
    message: "Supplier questionnaire fetched successfully",
    data: await SupplierQuestionnaireService.getPublicQuestionnaire(req.params.token),
  });
};

exports.submitQuestionnaire = async (req, res) => {
  return sendSuccess(res, {
    message: "Supplier questionnaire submitted successfully",
    data: await SupplierQuestionnaireService.submitPublicQuestionnaire(req.params.token, req.body, requestMeta(req)),
  });
};

exports.uploadEvidence = async (req, res) => {
  return sendSuccess(res, {
    statusCode: 201,
    message: "Supplier evidence file uploaded successfully",
    data: await SupplierQuestionnaireService.uploadPublicEvidence(req.params.token, req.file, req.body, requestMeta(req)),
  });
};
