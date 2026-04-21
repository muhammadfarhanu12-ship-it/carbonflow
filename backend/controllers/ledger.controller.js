const LedgerService = require("../services/ledger.service");
const SettingsService = require("../services/settings.service");
const { sendSuccess } = require("../utils/apiResponse");

exports.list = async (req, res) => {
  return sendSuccess(res, {
    message: "Ledger entries fetched successfully",
    data: await LedgerService.list(req.query, req.user.companyId),
  });
};

exports.create = async (req, res) => {
  const settings = await SettingsService.getByCompanyId(req.user.companyId);
  const entry = await LedgerService.create(req.body, req.user.companyId, settings.carbonPricePerTon, req.user);
  req.io.emit("ledgerUpdated", entry);
  return sendSuccess(res, {
    statusCode: 201,
    message: "Ledger entry created successfully",
    data: entry,
  });
};

exports.update = async (req, res) => {
  const settings = await SettingsService.getByCompanyId(req.user.companyId);
  const entry = await LedgerService.update(req.params.id, req.body, req.user.companyId, settings.carbonPricePerTon, req.user);
  req.io.emit("ledgerUpdated", entry);
  return sendSuccess(res, {
    message: "Ledger entry updated successfully",
    data: entry,
  });
};

exports.remove = async (req, res) => {
  const response = await LedgerService.remove(req.params.id, req.user.companyId, req.user);
  req.io.emit("ledgerDeleted", { id: req.params.id });
  return sendSuccess(res, {
    message: "Ledger entry deleted successfully",
    data: response,
  });
};
