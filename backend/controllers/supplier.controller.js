const SupplierService = require("../services/supplier.service");
const { calculateSupplierScore, calculateSupplierScoresBulk } = require("../services/supplierScoring.service");
const { sendSuccess } = require("../utils/apiResponse");

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

exports.create = async (req, res) => {
  const supplier = await SupplierService.create(req.body, req.user.companyId, req.user);
  const supplierView = SupplierService.toSupplierView(supplier);
  req.io.emit("supplierCreated", supplierView);
  return sendSuccess(res, {
    statusCode: 201,
    message: "Supplier created successfully",
    data: supplierView,
  });
};

exports.update = async (req, res) => {
  const supplier = await SupplierService.update(req.params.id, req.body, req.user.companyId, req.user);
  const supplierView = SupplierService.toSupplierView(supplier);
  req.io.emit("supplierUpdated", supplierView);
  return sendSuccess(res, {
    message: "Supplier updated successfully",
    data: supplierView,
  });
};

exports.remove = async (req, res) => {
  const response = await SupplierService.remove(req.params.id, req.user.companyId, req.user);
  req.io.emit("supplierDeleted", { id: req.params.id });
  return sendSuccess(res, {
    message: "Supplier deleted successfully",
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
