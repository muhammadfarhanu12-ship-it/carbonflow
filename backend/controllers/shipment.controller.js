const ShipmentService = require("../services/shipment.service");
const SettingsService = require("../services/settings.service");
const { sendSuccess } = require("../utils/apiResponse");

exports.list = async (req, res) => {
  const shipments = await ShipmentService.list(req.query, req.user.companyId);
  return sendSuccess(res, {
    message: "Shipments fetched successfully",
    data: shipments,
  });
};

exports.getById = async (req, res) => {
  return sendSuccess(res, {
    message: "Shipment fetched successfully",
    data: await ShipmentService.getById(req.params.id, req.user.companyId),
  });
};

exports.create = async (req, res) => {
  const settings = await SettingsService.getByCompanyId(req.user.companyId);
  const shipment = await ShipmentService.create(
    req.body,
    req.user.companyId,
    settings.carbonPricePerTon,
    req.user,
    settings.emissionFactorOverrides,
  );
  req.io.emit("shipmentCreated", shipment);
  return sendSuccess(res, {
    statusCode: 201,
    message: "Shipment created successfully",
    data: shipment,
  });
};

exports.update = async (req, res) => {
  const settings = await SettingsService.getByCompanyId(req.user.companyId);
  const shipment = await ShipmentService.update(
    req.params.id,
    req.body,
    req.user.companyId,
    settings.carbonPricePerTon,
    req.user,
    settings.emissionFactorOverrides,
  );
  req.io.emit("shipmentUpdated", shipment);
  return sendSuccess(res, {
    message: "Shipment updated successfully",
    data: shipment,
  });
};

exports.remove = async (req, res) => {
  const response = await ShipmentService.remove(req.params.id, req.user.companyId, req.user);
  req.io.emit("shipmentDeleted", { id: req.params.id });
  return sendSuccess(res, {
    message: "Shipment deleted successfully",
    data: response,
  });
};
