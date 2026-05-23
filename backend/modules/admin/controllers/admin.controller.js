const AdminService = require("../services/admin.service");
const MarketplaceService = require("../../../services/marketplace.service");
const { sendSuccess } = require("../../../utils/apiResponse");

function resolveAdminCompanyId(req) {
  return String(req.query.companyId || req.body.companyId || "").trim();
}

function buildMarketplaceAdminActor(admin) {
  return {
    id: admin?.id || admin?._id || null,
    name: admin?.name || admin?.email || "Admin",
    email: admin?.email || null,
    role: String(admin?.role || "admin").toUpperCase(),
  };
}

function requireCompanyId(req) {
  const companyId = resolveAdminCompanyId(req);
  if (!companyId) {
    const ApiError = require("../../../utils/ApiError");
    throw new ApiError(422, "companyId is required for admin marketplace operations.");
  }
  return companyId;
}

exports.getDashboard = async (_req, res) => sendSuccess(res, {
  message: "Admin dashboard fetched successfully",
  data: await AdminService.getDashboardData(),
});

exports.getUsers = async (req, res) => sendSuccess(res, {
  message: "Users fetched successfully",
  data: await AdminService.listUsers(req.query),
});

exports.updateUserStatus = async (req, res) => sendSuccess(res, {
  message: "User status updated successfully",
  data: await AdminService.updateUserStatus(req.params.id, req.body.status, req.admin),
});

exports.deleteUser = async (req, res) => sendSuccess(res, {
  message: "User deleted successfully",
  data: await AdminService.deleteUser(req.params.id, req.admin),
});

exports.getAnalytics = async (req, res) => sendSuccess(res, {
  message: "Analytics fetched successfully",
  data: await AdminService.getAnalytics(req.query),
});

exports.getCarbonData = async (req, res) => sendSuccess(res, {
  message: "Carbon data fetched successfully",
  data: await AdminService.listCarbonData(req.query),
});

exports.getEmissionFactors = async (req, res) => sendSuccess(res, {
  message: "Emission factors fetched successfully",
  data: await AdminService.listEmissionFactors(req.query),
});

exports.createEmissionFactor = async (req, res) => sendSuccess(res, {
  statusCode: 201,
  message: "Emission factor created successfully",
  data: await AdminService.createEmissionFactor(req.body, req.admin),
});

exports.updateEmissionFactor = async (req, res) => sendSuccess(res, {
  message: "Emission factor updated successfully",
  data: await AdminService.updateEmissionFactor(req.params.id, req.body, req.admin),
});

exports.deactivateEmissionFactor = async (req, res) => sendSuccess(res, {
  message: "Emission factor deactivated successfully",
  data: await AdminService.deactivateEmissionFactor(req.params.id, req.admin),
});

exports.reactivateEmissionFactor = async (req, res) => sendSuccess(res, {
  message: "Emission factor reactivated successfully",
  data: await AdminService.reactivateEmissionFactor(req.params.id, req.admin),
});

exports.previewEmissionFactorCsv = async (req, res) => sendSuccess(res, {
  message: "Emission factor CSV preview generated successfully",
  data: await AdminService.previewEmissionFactorCsv(req.body.csv, { ...req.admin, companyId: req.body.companyId || req.admin?.companyId || null }),
});

exports.uploadEmissionFactorCsv = async (req, res) => sendSuccess(res, {
  statusCode: 201,
  message: "Emission factor CSV imported successfully",
  data: await AdminService.uploadEmissionFactorCsv(req.body.csv, { ...req.admin, companyId: req.body.companyId || req.admin?.companyId || null }),
});

exports.getSupplierBenchmarks = async (req, res) => sendSuccess(res, {
  message: "Supplier benchmarks fetched successfully",
  data: await AdminService.listSupplierBenchmarks(req.query),
});

exports.createSupplierBenchmark = async (req, res) => sendSuccess(res, {
  statusCode: 201,
  message: "Supplier benchmark created successfully",
  data: await AdminService.createSupplierBenchmark(req.body, req.admin),
});

exports.uploadSupplierBenchmarkCsv = async (req, res) => sendSuccess(res, {
  statusCode: 201,
  message: "Supplier benchmark CSV uploaded successfully",
  data: await AdminService.uploadSupplierBenchmarkCsv(req.body, req.admin),
});

exports.deactivateSupplierBenchmark = async (req, res) => sendSuccess(res, {
  message: "Supplier benchmark deactivated successfully",
  data: await AdminService.deactivateSupplierBenchmark(req.params.id, req.admin),
});

exports.getReports = async (req, res) => sendSuccess(res, {
  message: "Reports fetched successfully",
  data: await AdminService.listReports(req.query),
});

exports.updateReport = async (req, res) => sendSuccess(res, {
  message: "Report updated successfully",
  data: await AdminService.updateReport(req.params.id, req.body, req.admin),
});

exports.deleteReport = async (req, res) => sendSuccess(res, {
  message: "Report deleted successfully",
  data: await AdminService.deleteReport(req.params.id, req.admin),
});

exports.getSettings = async (_req, res) => sendSuccess(res, {
  message: "Admin settings fetched successfully",
  data: await AdminService.getSettings(),
});

exports.updateSettings = async (req, res) => sendSuccess(res, {
  message: "Admin settings updated successfully",
  data: await AdminService.updateSettings(req.body, req.admin),
});

exports.getMarketplaceOverview = async (req, res) => {
  const companyId = requireCompanyId(req);
  return sendSuccess(res, {
    message: "Admin marketplace overview fetched successfully",
    data: {
      listings: await MarketplaceService.list({ ...req.query, includeAllStatuses: "true", pageSize: req.query.pageSize || 50 }, companyId, buildMarketplaceAdminActor(req.admin)),
      budget: await MarketplaceService.getBudget(companyId),
      operations: await MarketplaceService.getOperationalReview(companyId),
    },
  });
};

exports.createMarketplaceListing = async (req, res) => {
  const companyId = requireCompanyId(req);
  return sendSuccess(res, {
    statusCode: 201,
    message: "Admin marketplace listing created successfully",
    data: await MarketplaceService.create(req.body, companyId, buildMarketplaceAdminActor(req.admin)),
  });
};

exports.updateMarketplaceListing = async (req, res) => {
  const companyId = requireCompanyId(req);
  return sendSuccess(res, {
    message: "Admin marketplace listing updated successfully",
    data: await MarketplaceService.update(req.params.id, req.body, companyId, buildMarketplaceAdminActor(req.admin)),
  });
};

exports.adjustMarketplaceInventory = async (req, res) => {
  const companyId = requireCompanyId(req);
  return sendSuccess(res, {
    message: "Admin marketplace inventory adjusted successfully",
    data: await MarketplaceService.adjustInventory(req.params.id, companyId, req.body, buildMarketplaceAdminActor(req.admin), {
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    }),
  });
};

exports.approveMarketplaceBudgetRequest = async (req, res) => {
  const companyId = requireCompanyId(req);
  return sendSuccess(res, {
    message: "Admin marketplace budget request approved successfully",
    data: await MarketplaceService.approveBudgetRequest(req.params.requestId, companyId, buildMarketplaceAdminActor(req.admin), req.body, {
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    }),
  });
};

exports.rejectMarketplaceBudgetRequest = async (req, res) => {
  const companyId = requireCompanyId(req);
  return sendSuccess(res, {
    message: "Admin marketplace budget request rejected successfully",
    data: await MarketplaceService.rejectBudgetRequest(req.params.requestId, companyId, buildMarketplaceAdminActor(req.admin), req.body, {
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    }),
  });
};

exports.submitMarketplaceRetirement = async (req, res) => {
  const companyId = requireCompanyId(req);
  return sendSuccess(res, {
    message: "Admin marketplace retirement submitted successfully",
    data: await MarketplaceService.submitRetirement(req.params.id, companyId, buildMarketplaceAdminActor(req.admin), {
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    }),
  });
};

exports.manualMarketplaceRetirement = async (req, res) => {
  const companyId = requireCompanyId(req);
  return sendSuccess(res, {
    message: "Admin marketplace retirement manually verified successfully",
    data: await MarketplaceService.manualRetirement(req.params.id, companyId, req.body, buildMarketplaceAdminActor(req.admin), {
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    }),
  });
};

exports.createMarketplaceInvoice = async (req, res) => {
  const companyId = requireCompanyId(req);
  return sendSuccess(res, {
    message: "Admin marketplace invoice created successfully",
    data: await MarketplaceService.createInvoice(req.params.id, companyId, buildMarketplaceAdminActor(req.admin), {
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    }),
  });
};

exports.markMarketplacePaid = async (req, res) => {
  const companyId = requireCompanyId(req);
  return sendSuccess(res, {
    message: "Admin marketplace payment marked paid successfully",
    data: await MarketplaceService.markPaid(req.params.id, companyId, req.body, buildMarketplaceAdminActor(req.admin), {
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    }),
  });
};

exports.markMarketplacePaymentFailed = async (req, res) => {
  const companyId = requireCompanyId(req);
  return sendSuccess(res, {
    message: "Admin marketplace payment marked failed successfully",
    data: await MarketplaceService.markPaymentFailed(req.params.id, companyId, req.body, buildMarketplaceAdminActor(req.admin), {
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    }),
  });
};

exports.cancelMarketplacePayment = async (req, res) => {
  const companyId = requireCompanyId(req);
  return sendSuccess(res, {
    message: "Admin marketplace payment cancelled successfully",
    data: await MarketplaceService.cancelPayment(req.params.id, companyId, req.body, buildMarketplaceAdminActor(req.admin), {
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    }),
  });
};

exports.refundMarketplacePayment = async (req, res) => {
  const companyId = requireCompanyId(req);
  return sendSuccess(res, {
    message: "Admin marketplace payment refunded successfully",
    data: await MarketplaceService.refund(req.params.id, companyId, req.body, buildMarketplaceAdminActor(req.admin), {
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    }),
  });
};
