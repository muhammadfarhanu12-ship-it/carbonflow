const NavigationService = require("../services/navigation.service");
const { sendSuccess } = require("../utils/apiResponse");

exports.summary = async (req, res) => sendSuccess(res, {
  message: "Navigation summary fetched successfully",
  data: await NavigationService.summary(req.user.companyId),
});
