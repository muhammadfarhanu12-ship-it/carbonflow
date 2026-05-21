const SupplierService = require("../services/supplier.service");
const { calculateSupplierScore, calculateSupplierScoresBulk } = require("../services/supplierScoring.service");
const { sendSuccess } = require("../utils/apiResponse");

function requestMeta(req) {
  return {
    ipAddress: req.ip || req.headers?.["x-forwarded-for"] || null,
    userAgent: req.headers?.["user-agent"] || null,
  };
}

exports.list = async (req, res) => {
  const result = await SupplierService.list(req.query, req.user.companyId);
  return sendSuccess(res, {
    message: "Suppliers fetched successfully",
    data: result,
  });
};

exports.getById = async (req, res) => {
  return sendSuccess(res, {
    message: "Supplier fetched successfully",
    data: SupplierService.toSupplierView(await SupplierService.getById(req.params.id, req.user.companyId)),
  });
};

exports.scorecard = async (req, res) => {
  return sendSuccess(res, {
    message: "Supplier scorecard fetched successfully",
    data: await SupplierService.getScorecard(req.params.id, req.user.companyId),
  });
};

exports.recalculateScore = async (req, res) => {
  const supplierView = await SupplierService.recalculateScore(req.params.id, req.user.companyId, req.user, requestMeta(req));
  req.io.emit("supplierUpdated", supplierView);
  return sendSuccess(res, {
    message: "Supplier score recalculated successfully",
    data: supplierView,
  });
};

exports.summary = async (req, res) => {
  return sendSuccess(res, {
    message: "Supplier summary fetched successfully",
    data: await SupplierService.summary(req.user.companyId),
  });
};

exports.sendQuestionnaire = async (req, res) => {
  const result = await SupplierService.sendQuestionnaire(req.params.id, req.user.companyId, req.user, req.body, requestMeta(req));
  req.io.emit("supplierUpdated", result.supplierView);
  return sendSuccess(res, {
    message: result.message,
    data: result.questionnaire,
  });
};

exports.resendQuestionnaire = async (req, res) => {
  const result = await SupplierService.resendQuestionnaire(req.params.id, req.user.companyId, req.user, req.body, requestMeta(req));
  req.io.emit("supplierUpdated", result.supplierView);
  return sendSuccess(res, {
    message: result.message,
    data: result.questionnaire,
  });
};

exports.updateQuestionnaireStatus = async (req, res) => {
  const result = await SupplierService.updateQuestionnaireStatus(req.params.id, req.user.companyId, req.body, req.user, requestMeta(req));
  req.io.emit("supplierUpdated", result.supplierView);
  return sendSuccess(res, {
    message: "Supplier questionnaire status updated successfully",
    data: result.questionnaire,
  });
};

exports.getQuestionnaire = async (req, res) => {
  return sendSuccess(res, {
    message: "Supplier questionnaire fetched successfully",
    data: await SupplierService.getQuestionnaire(req.params.id, req.user.companyId),
  });
};

exports.listEvidence = async (req, res) => {
  return sendSuccess(res, {
    message: "Supplier evidence fetched successfully",
    data: await SupplierService.listEvidence(req.params.id, req.user.companyId),
  });
};

exports.createEvidence = async (req, res) => {
  return sendSuccess(res, {
    statusCode: 201,
    message: "Supplier evidence created successfully",
    data: await SupplierService.createEvidence(req.params.id, req.user.companyId, req.body, req.user, requestMeta(req)),
  });
};

exports.uploadEvidence = async (req, res) => {
  return sendSuccess(res, {
    statusCode: 201,
    message: "Supplier evidence file uploaded successfully",
    data: await SupplierService.uploadEvidenceFile(req.params.id, req.user.companyId, req.file, req.body, req.user, requestMeta(req)),
  });
};

exports.downloadEvidence = async (req, res) => {
  const download = await SupplierService.downloadEvidenceFile(req.params.id, req.params.evidenceId, req.user.companyId, req.user, requestMeta(req));

  if (download.redirectUrl) {
    return res.redirect(download.redirectUrl);
  }

  res.setHeader("Content-Type", download.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${String(download.fileName).replace(/"/g, "")}"`);
  return download.stream.pipe(res);
};

exports.updateEvidence = async (req, res) => {
  return sendSuccess(res, {
    message: "Supplier evidence updated successfully",
    data: await SupplierService.updateEvidence(req.params.id, req.params.evidenceId, req.user.companyId, req.body, req.user, requestMeta(req)),
  });
};

exports.verifyEvidence = async (req, res) => {
  return sendSuccess(res, {
    message: "Supplier evidence verified successfully",
    data: await SupplierService.verifyEvidence(req.params.id, req.params.evidenceId, req.user.companyId, req.user, requestMeta(req)),
  });
};

exports.rejectEvidence = async (req, res) => {
  return sendSuccess(res, {
    message: "Supplier evidence rejected successfully",
    data: await SupplierService.rejectEvidence(req.params.id, req.params.evidenceId, req.user.companyId, req.body, req.user, requestMeta(req)),
  });
};

exports.create = async (req, res) => {
  const supplier = await SupplierService.create(req.body, req.user.companyId, req.user, requestMeta(req));
  const supplierView = SupplierService.toSupplierView(supplier);
  req.io.emit("supplierCreated", supplierView);
  return sendSuccess(res, {
    statusCode: 201,
    message: "Supplier created successfully",
    data: supplierView,
  });
};

exports.update = async (req, res) => {
  const supplier = await SupplierService.update(req.params.id, req.body, req.user.companyId, req.user, requestMeta(req));
  const supplierView = SupplierService.toSupplierView(supplier);
  req.io.emit("supplierUpdated", supplierView);
  return sendSuccess(res, {
    message: "Supplier updated successfully",
    data: supplierView,
  });
};

exports.archive = async (req, res) => {
  const supplierView = await SupplierService.archive(req.params.id, req.user.companyId, req.user, requestMeta(req));
  req.io.emit("supplierUpdated", supplierView);
  return sendSuccess(res, {
    message: "Supplier archived successfully",
    data: supplierView,
  });
};

exports.remove = async (req, res) => {
  const response = await SupplierService.remove(req.params.id, req.user.companyId, req.user, requestMeta(req));
  req.io.emit("supplierUpdated", response);
  return sendSuccess(res, {
    message: "Supplier archived successfully",
    data: response,
  });
};

exports.score = async (req, res) => {
  return sendSuccess(res, {
    message: "Supplier scored successfully",
    data: calculateSupplierScore(req.body),
  });
};

exports.bulkScore = async (req, res) => {
  const suppliers = Array.isArray(req.body) ? req.body : req.body.suppliers;
  const result = await calculateSupplierScoresBulk(suppliers);

  return sendSuccess(res, {
    message: "Suppliers scored successfully",
    data: {
      scoredSuppliers: result.suppliers,
      stats: result.stats,
    },
  });
};
