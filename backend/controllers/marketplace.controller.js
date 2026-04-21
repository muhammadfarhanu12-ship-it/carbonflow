const MarketplaceService = require("../services/marketplace.service");
const { sendSuccess } = require("../utils/apiResponse");

function getRequestIp(req) {
  return req.ip || req.headers["x-forwarded-for"] || null;
}

exports.list = async (req, res) => sendSuccess(res, {
  message: "Marketplace projects fetched successfully",
  data: await MarketplaceService.list(req.query, req.user.companyId, req.user),
});

exports.requestBudgetIncrease = async (req, res) => sendSuccess(res, {
  message: "Budget increase request sent to company admin",
  data: await MarketplaceService.requestBudgetIncrease(req.body, req.user.companyId, req.user, {
    ipAddress: getRequestIp(req),
  }),
});

exports.create = async (req, res) => {
  const project = await MarketplaceService.create(req.body, req.user.companyId, req.user);
  req.io.emit("projectCreated", project);
  return sendSuccess(res, {
    statusCode: 201,
    message: "Marketplace project created successfully",
    data: project,
  });
};

exports.createManagedProject = async (req, res) => {
  const project = await MarketplaceService.create(req.body, req.user.companyId, req.user);
  req.io.emit("projectCreated", project);
  return sendSuccess(res, {
    statusCode: 201,
    message: "Marketplace project saved successfully",
    data: project,
  });
};

exports.update = async (req, res) => {
  const project = await MarketplaceService.update(req.params.id, req.body, req.user.companyId, req.user);
  req.io.emit("projectUpdated", project);
  return sendSuccess(res, {
    message: "Marketplace project updated successfully",
    data: project,
  });
};

exports.remove = async (req, res) => {
  const response = await MarketplaceService.remove(req.params.id, req.user.companyId, req.user, {
    ipAddress: getRequestIp(req),
  });

  if (response.action === "deleted") {
    req.io.emit("projectDeleted", { id: response.id || req.params.id });
  } else if (response.project) {
    req.io.emit("projectUpdated", response.project);
  }

  return sendSuccess(res, {
    message: response.action === "deleted"
      ? "Marketplace project permanently deleted successfully"
      : "Marketplace project archived to preserve historical transactions",
    data: response,
  });
};

exports.toggleStatus = async (req, res) => {
  const response = await MarketplaceService.toggleStatus(req.params.id, req.user.companyId, req.user, {
    source: "manual.toggle_status",
    reason: "Listing status toggled by user action",
    ipAddress: getRequestIp(req),
  });

  if (response.action === "deleted") {
    req.io.emit("projectDeleted", { id: response.id || req.params.id });
  } else if (response.project) {
    req.io.emit("projectUpdated", response.project);
  }

  return sendSuccess(res, {
    message: response.action === "published"
      ? "Marketplace project restored successfully"
      : response.action === "sold_out"
        ? "Marketplace project restored as sold out successfully"
        : "Marketplace project archived successfully",
    data: response,
  });
};

exports.archive = async (req, res) => {
  const project = await MarketplaceService.updateStatus(req.params.id, "ARCHIVED", req.user.companyId, req.user, {
    source: "manual.archive",
    reason: "Listing archived by user action",
    ipAddress: getRequestIp(req),
  });
  req.io.emit("projectUpdated", project);
  return sendSuccess(res, {
    message: "Marketplace project archived successfully",
    data: project,
  });
};

exports.deactivate = async (req, res) => {
  const project = await MarketplaceService.updateStatus(req.params.id, "DRAFT", req.user.companyId, req.user, {
    source: "manual.deactivate",
    reason: "Listing moved back to draft by user action",
    ipAddress: getRequestIp(req),
  });
  req.io.emit("projectUpdated", project);
  return sendSuccess(res, {
    message: "Marketplace project moved to draft successfully",
    data: project,
  });
};

exports.markSoldOut = async (req, res) => {
  const project = await MarketplaceService.updateStatus(req.params.id, "SOLD_OUT", req.user.companyId, req.user, {
    source: "manual.sold_out",
    reason: "Listing manually marked as sold out",
    ipAddress: getRequestIp(req),
  });
  req.io.emit("projectUpdated", project);
  return sendSuccess(res, {
    message: "Marketplace project marked as sold out successfully",
    data: project,
  });
};

exports.buyCredits = async (req, res) => {
  const project = await MarketplaceService.buyCredits(req.params.id, Number(req.body.credits), req.user.companyId, req.user);
  req.io.emit("projectUpdated", project);
  return sendSuccess(res, {
    message: "Carbon credits purchased successfully",
    data: project,
  });
};
