const ShipmentEmissionsService = require("../services/shipmentEmissions.service");

exports.calculateShipmentEmissions = async (req, res) => {
  const data = await ShipmentEmissionsService.buildShipmentEmissionsReport(req.body);

  return res.status(200).json({
    success: true,
    data,
  });
};
