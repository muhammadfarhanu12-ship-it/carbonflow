const MarketplaceService = require("../services/marketplace.service");
const { sendSuccess } = require("../utils/apiResponse");

function getRequestIp(req) {
  return req.ip || req.headers["x-forwarded-for"] || null;
}

exports.list = async (req, res) => sendSuccess(res, {
  message: "Marketplace listings fetched successfully",
  data: await MarketplaceService.list(req.query, req.user.companyId, req.user),
});

exports.getById = async (req, res) => sendSuccess(res, {
  message: "Marketplace listing fetched successfully",
  data: await MarketplaceService.getById(req.params.id, req.user.companyId, req.user),
});

exports.getBudget = async (req, res) => sendSuccess(res, {
  message: "Marketplace budget fetched successfully",
  data: await MarketplaceService.getBudget(req.user.companyId),
});

exports.updateBudget = async (req, res) => sendSuccess(res, {
  message: "Marketplace budget updated successfully",
  data: await MarketplaceService.updateBudget(req.body, req.user.companyId, req.user, {
    ipAddress: getRequestIp(req),
  }),
});

exports.getBudgetRequests = async (req, res) => sendSuccess(res, {
  message: "Marketplace budget requests fetched successfully",
  data: (await MarketplaceService.getBudget(req.user.companyId)).requests,
});

exports.getBudgetRequest = async (req, res) => sendSuccess(res, {
  message: "Marketplace budget request fetched successfully",
  data: await MarketplaceService.getBudgetRequest(req.params.requestId, req.user.companyId),
});

exports.approveBudgetRequest = async (req, res) => sendSuccess(res, {
  message: "Marketplace budget request approved successfully",
  data: await MarketplaceService.approveBudgetRequest(req.params.requestId, req.user.companyId, req.user, req.body, {
    ipAddress: getRequestIp(req),
  }),
});

exports.rejectBudgetRequest = async (req, res) => sendSuccess(res, {
  message: "Marketplace budget request rejected successfully",
  data: await MarketplaceService.rejectBudgetRequest(req.params.requestId, req.user.companyId, req.user, req.body, {
    ipAddress: getRequestIp(req),
  }),
});

exports.cancelBudgetRequest = async (req, res) => sendSuccess(res, {
  message: "Marketplace budget request cancelled successfully",
  data: await MarketplaceService.cancelBudgetRequest(req.params.requestId, req.user.companyId, req.user, {
    ipAddress: getRequestIp(req),
  }),
});

exports.requestBudgetIncrease = async (req, res) => sendSuccess(res, {
  message: "Budget increase request recorded",
  data: await MarketplaceService.requestBudgetIncrease(req.body, req.user.companyId, req.user, {
    ipAddress: getRequestIp(req),
  }),
});

exports.getAutoOffsetRule = async (req, res) => sendSuccess(res, {
  message: "Auto-offset rule fetched successfully",
  data: await MarketplaceService.getAutoOffsetRule(req.user.companyId),
});

exports.submitRetirement = async (req, res) => sendSuccess(res, {
  message: "Registry retirement submission recorded",
  data: await MarketplaceService.submitRetirement(req.params.id, req.user.companyId, req.user, {
    ipAddress: getRequestIp(req),
  }),
});

exports.manualRetirement = async (req, res) => sendSuccess(res, {
  message: "Manual registry retirement verified",
  data: await MarketplaceService.manualRetirement(req.params.id, req.user.companyId, req.body, req.user, {
    ipAddress: getRequestIp(req),
  }),
});

exports.getRetirementStatus = async (req, res) => sendSuccess(res, {
  message: "Registry retirement status fetched successfully",
  data: await MarketplaceService.getRetirementStatus(req.params.id, req.user.companyId),
});

exports.createInvoice = async (req, res) => sendSuccess(res, {
  message: "Marketplace invoice created",
  data: await MarketplaceService.createInvoice(req.params.id, req.user.companyId, req.user, {
    ipAddress: getRequestIp(req),
  }),
});

exports.markPaid = async (req, res) => sendSuccess(res, {
  message: "Marketplace payment marked paid",
  data: await MarketplaceService.markPaid(req.params.id, req.user.companyId, req.body, req.user, {
    ipAddress: getRequestIp(req),
  }),
});

exports.refund = async (req, res) => sendSuccess(res, {
  message: "Marketplace payment refunded",
  data: await MarketplaceService.refund(req.params.id, req.user.companyId, req.body, req.user, {
    ipAddress: getRequestIp(req),
  }),
});

exports.markPaymentFailed = async (req, res) => sendSuccess(res, {
  message: "Marketplace payment marked failed",
  data: await MarketplaceService.markPaymentFailed(req.params.id, req.user.companyId, req.body, req.user, {
    ipAddress: getRequestIp(req),
  }),
});

exports.cancelPayment = async (req, res) => sendSuccess(res, {
  message: "Marketplace payment cancelled",
  data: await MarketplaceService.cancelPayment(req.params.id, req.user.companyId, req.body, req.user, {
    ipAddress: getRequestIp(req),
  }),
});

exports.getPaymentStatus = async (req, res) => sendSuccess(res, {
  message: "Marketplace payment status fetched successfully",
  data: await MarketplaceService.getPaymentStatus(req.params.id, req.user.companyId),
});

exports.getOperationalReview = async (req, res) => sendSuccess(res, {
  message: "Marketplace operational review fetched successfully",
  data: await MarketplaceService.getOperationalReview(req.user.companyId),
});

exports.updateAutoOffsetRule = async (req, res) => sendSuccess(res, {
  message: "Auto-offset rule updated successfully",
  data: await MarketplaceService.updateAutoOffsetRule(req.body, req.user.companyId, req.user, {
    ipAddress: getRequestIp(req),
  }),
});

exports.evaluateAutoOffsetRule = async (req, res) => sendSuccess(res, {
  message: "Auto-offset rule evaluated successfully",
  data: await MarketplaceService.evaluateAutoOffsetRule(req.user.companyId, req.user, {
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

exports.adjustInventory = async (req, res) => {
  const project = await MarketplaceService.adjustInventory(req.params.id, req.user.companyId, req.body, req.user, {
    ipAddress: getRequestIp(req),
  });
  req.io.emit("projectUpdated", project);
  return sendSuccess(res, {
    message: "Marketplace inventory adjusted successfully",
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

exports.publish = async (req, res) => {
  const project = await MarketplaceService.updateStatus(req.params.id, "PUBLISHED", req.user.companyId, req.user, {
    source: "manual.publish",
    reason: "Listing published by user action",
    ipAddress: getRequestIp(req),
  });
  req.io.emit("projectUpdated", project);
  return sendSuccess(res, {
    message: "Marketplace listing published successfully",
    data: project,
  });
};

exports.pause = async (req, res) => {
  const project = await MarketplaceService.updateStatus(req.params.id, "PAUSED", req.user.companyId, req.user, {
    source: "manual.pause",
    reason: "Listing paused by user action",
    ipAddress: getRequestIp(req),
  });
  req.io.emit("projectUpdated", project);
  return sendSuccess(res, {
    message: "Marketplace listing paused successfully",
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
