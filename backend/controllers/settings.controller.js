const SettingsService = require("../services/settings.service");
const { sendSuccess } = require("../utils/apiResponse");

exports.get = async (req, res) => sendSuccess(res, {
  message: "Settings fetched successfully",
  data: await SettingsService.get(req.user),
});

exports.update = async (req, res) => {
  const settings = await SettingsService.update(req.user, req.body);
  req.io.emit("settingsUpdated", settings);
  return sendSuccess(res, {
    message: "Settings updated successfully",
    data: settings,
  });
};

exports.createApiKey = async (req, res) => {
  const settings = await SettingsService.createApiKey(req.user, req.body.label);
  req.io.emit("settingsUpdated", settings);
  return sendSuccess(res, {
    statusCode: 201,
    message: "API key created successfully",
    data: settings,
  });
};

exports.syncIntegration = async (req, res) => {
  const settings = await SettingsService.syncIntegration(req.user, req.params.name);
  req.io.emit("settingsUpdated", settings);
  return sendSuccess(res, {
    message: "Integration synced successfully",
    data: settings,
  });
};
