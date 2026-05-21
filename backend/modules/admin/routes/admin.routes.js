const express = require("express");
const catchAsync = require("../../../utils/catchAsync");
const validateRequest = require("../../../middlewares/validateRequest");
const { adminAuthRateLimiter } = require("../../../middlewares/rateLimiter");
const authController = require("../controllers/adminAuth.controller");
const adminController = require("../controllers/admin.controller");
const {
  verifyAdminToken,
  optionalAdminToken,
  requireAdminPermission,
  requireAdminRole,
} = require("../middleware/adminAuthMiddleware");
const {
  loginValidator,
  registerValidator,
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
router.post("/auth/register", optionalAdminToken, registerValidator, validateRequest, catchAsync(authController.register));
router.get("/auth/me", verifyAdminToken, catchAsync(authController.me));
router.put("/auth/password", verifyAdminToken, changePasswordValidator, validateRequest, catchAsync(authController.changePassword));

router.use(verifyAdminToken);

router.get("/dashboard", catchAsync(adminController.getDashboard));

router.get("/users", requireAdminPermission("user:manage"), listUsersValidator, validateRequest, catchAsync(adminController.getUsers));
router.patch("/users/:id/status", requireAdminPermission("user:manage"), userStatusValidator, validateRequest, catchAsync(adminController.updateUserStatus));
router.delete("/users/:id", requireAdminPermission("user:manage"), requireAdminRole("superadmin"), deleteUserValidator, validateRequest, catchAsync(adminController.deleteUser));

router.get("/analytics", analyticsValidator, validateRequest, catchAsync(adminController.getAnalytics));
router.get("/carbon-data", carbonDataValidator, validateRequest, catchAsync(adminController.getCarbonData));

router.get("/emission-factors", requireAdminPermission("factor:manage"), catchAsync(adminController.getEmissionFactors));
router.post("/emission-factors", requireAdminPermission("factor:manage"), catchAsync(adminController.createEmissionFactor));
router.put("/emission-factors/:id", requireAdminPermission("factor:manage"), catchAsync(adminController.updateEmissionFactor));
router.patch("/emission-factors/:id", requireAdminPermission("factor:manage"), catchAsync(adminController.updateEmissionFactor));
router.patch("/emission-factors/:id/deactivate", requireAdminPermission("factor:manage"), catchAsync(adminController.deactivateEmissionFactor));

router.get("/supplier-benchmarks", requireAdminPermission("factor:manage"), catchAsync(adminController.getSupplierBenchmarks));
router.post("/supplier-benchmarks", requireAdminPermission("factor:manage"), catchAsync(adminController.createSupplierBenchmark));
router.post("/supplier-benchmarks/upload-csv", requireAdminPermission("factor:manage"), catchAsync(adminController.uploadSupplierBenchmarkCsv));
router.patch("/supplier-benchmarks/:id/deactivate", requireAdminPermission("factor:manage"), catchAsync(adminController.deactivateSupplierBenchmark));

router.get("/reports", reportsValidator, validateRequest, catchAsync(adminController.getReports));
router.patch("/reports/:id", requireAdminPermission("report:generate"), updateReportValidator, validateRequest, catchAsync(adminController.updateReport));
router.delete("/reports/:id", requireAdminPermission("report:generate"), requireAdminRole("superadmin"), reportIdValidator, validateRequest, catchAsync(adminController.deleteReport));

router.get("/settings", catchAsync(adminController.getSettings));
router.put("/settings", requireAdminRole("superadmin"), settingsValidator, validateRequest, catchAsync(adminController.updateSettings));

module.exports = router;
