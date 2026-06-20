const express = require("express");
const catchAsync = require("../../../utils/catchAsync");
const validateRequest = require("../../../middlewares/validateRequest");
const { adminAuthRateLimiter } = require("../../../middlewares/rateLimiter");
const authController = require("../controllers/adminAuth.controller");
const adminController = require("../controllers/admin.controller");
const {
  verifyAdminToken,
  requireAdminPermission,
  requireAdminRole,
  requirePlatformAdmin,
} = require("../middleware/adminAuthMiddleware");
const {
  loginValidator,
  changePasswordValidator,
} = require("../validators/adminAuth.validator");
const {
  listUsersValidator,
  userStatusValidator,
  deleteUserValidator,
  reportIdValidator,
  analyticsValidator,
  carbonDataValidator,
  reportsValidator,
  updateReportValidator,
  settingsValidator,
} = require("../validators/admin.validator");

const router = express.Router();

router.post("/auth/login", adminAuthRateLimiter, loginValidator, validateRequest, catchAsync(authController.login));
router.get("/auth/me", verifyAdminToken, requirePlatformAdmin, catchAsync(authController.me));
router.put("/auth/password", verifyAdminToken, requirePlatformAdmin, changePasswordValidator, validateRequest, catchAsync(authController.changePassword));

router.use(verifyAdminToken);
router.use(requirePlatformAdmin);

router.get("/dashboard", catchAsync(adminController.getDashboard));

router.get("/users", requireAdminPermission("admin:users"), listUsersValidator, validateRequest, catchAsync(adminController.getUsers));
router.patch("/users/:id/status", requireAdminPermission("admin:users"), userStatusValidator, validateRequest, catchAsync(adminController.updateUserStatus));
router.delete("/users/:id", requireAdminPermission("admin:users"), requireAdminRole("SUPER_ADMIN"), deleteUserValidator, validateRequest, catchAsync(adminController.deleteUser));

router.get("/analytics", requireAdminPermission("admin:audit"), analyticsValidator, validateRequest, catchAsync(adminController.getAnalytics));
router.get("/carbon-data", requireAdminPermission("admin:audit"), carbonDataValidator, validateRequest, catchAsync(adminController.getCarbonData));

router.get("/emission-factors", requireAdminPermission("admin:factors"), catchAsync(adminController.getEmissionFactors));
router.post("/emission-factors", requireAdminPermission("admin:factors"), catchAsync(adminController.createEmissionFactor));
router.post("/emission-factors/import/preview", requireAdminPermission("admin:factors"), catchAsync(adminController.previewEmissionFactorCsv));
router.post("/emission-factors/import/commit", requireAdminPermission("admin:factors"), catchAsync(adminController.uploadEmissionFactorCsv));
router.put("/emission-factors/:id", requireAdminPermission("admin:factors"), catchAsync(adminController.updateEmissionFactor));
router.patch("/emission-factors/:id", requireAdminPermission("admin:factors"), catchAsync(adminController.updateEmissionFactor));
router.patch("/emission-factors/:id/deactivate", requireAdminPermission("admin:factors"), catchAsync(adminController.deactivateEmissionFactor));
router.patch("/emission-factors/:id/reactivate", requireAdminPermission("admin:factors"), catchAsync(adminController.reactivateEmissionFactor));

router.get("/supplier-benchmarks", requireAdminPermission("admin:factors"), catchAsync(adminController.getSupplierBenchmarks));
router.post("/supplier-benchmarks", requireAdminPermission("admin:factors"), catchAsync(adminController.createSupplierBenchmark));
router.post("/supplier-benchmarks/upload-csv", requireAdminPermission("admin:factors"), catchAsync(adminController.uploadSupplierBenchmarkCsv));
router.patch("/supplier-benchmarks/:id/deactivate", requireAdminPermission("admin:factors"), catchAsync(adminController.deactivateSupplierBenchmark));

router.get("/reports", requireAdminPermission("admin:audit"), reportsValidator, validateRequest, catchAsync(adminController.getReports));
router.patch("/reports/:id", requireAdminPermission("admin:audit"), updateReportValidator, validateRequest, catchAsync(adminController.updateReport));
router.delete("/reports/:id", requireAdminPermission("admin:audit"), requireAdminRole("SUPER_ADMIN"), reportIdValidator, validateRequest, catchAsync(adminController.deleteReport));

router.get("/settings", requireAdminPermission("admin:settings"), catchAsync(adminController.getSettings));
router.put("/settings", requireAdminPermission("admin:settings"), requireAdminRole("SUPER_ADMIN"), settingsValidator, validateRequest, catchAsync(adminController.updateSettings));

router.get("/marketplace", requireAdminPermission("admin:companies"), catchAsync(adminController.getMarketplaceOverview));
router.post("/marketplace/listings", requireAdminPermission("admin:companies"), catchAsync(adminController.createMarketplaceListing));
router.patch("/marketplace/listings/:id", requireAdminPermission("admin:companies"), catchAsync(adminController.updateMarketplaceListing));
router.patch("/marketplace/listings/:id/inventory", requireAdminPermission("admin:companies"), catchAsync(adminController.adjustMarketplaceInventory));
router.patch("/marketplace/budget/requests/:requestId/approve", requireAdminPermission("admin:companies"), catchAsync(adminController.approveMarketplaceBudgetRequest));
router.patch("/marketplace/budget/requests/:requestId/reject", requireAdminPermission("admin:companies"), catchAsync(adminController.rejectMarketplaceBudgetRequest));
router.post("/marketplace/transactions/:id/submit-retirement", requireAdminPermission("admin:companies"), catchAsync(adminController.submitMarketplaceRetirement));
router.patch("/marketplace/transactions/:id/manual-retirement", requireAdminPermission("admin:companies"), catchAsync(adminController.manualMarketplaceRetirement));
router.post("/marketplace/transactions/:id/create-invoice", requireAdminPermission("admin:companies"), catchAsync(adminController.createMarketplaceInvoice));
router.patch("/marketplace/transactions/:id/mark-paid", requireAdminPermission("admin:companies"), catchAsync(adminController.markMarketplacePaid));
router.patch("/marketplace/transactions/:id/mark-failed", requireAdminPermission("admin:companies"), catchAsync(adminController.markMarketplacePaymentFailed));
router.patch("/marketplace/transactions/:id/cancel", requireAdminPermission("admin:companies"), catchAsync(adminController.cancelMarketplacePayment));
router.patch("/marketplace/transactions/:id/refund", requireAdminPermission("admin:companies"), catchAsync(adminController.refundMarketplacePayment));

module.exports = router;
