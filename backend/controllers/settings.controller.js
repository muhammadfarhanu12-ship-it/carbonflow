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
  const settings = await SettingsService.createApiKey(req.user, req.body);
  req.io.emit("settingsUpdated", settings);
  return sendSuccess(res, {
    statusCode: 201,
    message: "API key created successfully",
    data: settings,
  });
};

exports.revokeApiKey = async (req, res) => {
  const settings = await SettingsService.revokeApiKey(req.user, req.params.id);
  req.io.emit("settingsUpdated", settings);
  return sendSuccess(res, {
    message: "API key revoked successfully",
    data: settings,
  });
};

exports.rotateApiKey = async (req, res) => {
  const settings = await SettingsService.rotateApiKey(req.user, req.params.id, req.body);
  req.io.emit("settingsUpdated", settings);
  return sendSuccess(res, {
    message: "API key rotated successfully",
    data: settings,
  });
};

exports.testIntegration = async (req, res) => {
  const settings = await SettingsService.testIntegration(req.user, req.params.name);
  req.io.emit("settingsUpdated", settings);
  return sendSuccess(res, {
    message: "Integration test completed",
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

exports.integrationHistory = async (req, res) => sendSuccess(res, {
  message: "Integration sync history fetched successfully",
  data: await SettingsService.integrationHistory(req.user, req.params.name),
});
