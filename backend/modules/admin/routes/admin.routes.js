const express = require("express");
const catchAsync = require("../../../utils/catchAsync");
const validateRequest = require("../../../middlewares/validateRequest");
const { adminAuthRateLimiter } = require("../../../middlewares/rateLimiter");
const authController = require("../controllers/adminAuth.controller");
const adminController = require("../controllers/admin.controller");
const {
  verifyAdminToken,
  optionalAdminToken,
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

router.get("/users", listUsersValidator, validateRequest, catchAsync(adminController.getUsers));
router.patch("/users/:id/status", userStatusValidator, validateRequest, catchAsync(adminController.updateUserStatus));
router.delete("/users/:id", requireAdminRole("superadmin"), deleteUserValidator, validateRequest, catchAsync(adminController.deleteUser));

router.get("/analytics", analyticsValidator, validateRequest, catchAsync(adminController.getAnalytics));
router.get("/carbon-data", carbonDataValidator, validateRequest, catchAsync(adminController.getCarbonData));

router.get("/reports", reportsValidator, validateRequest, catchAsync(adminController.getReports));
router.patch("/reports/:id", updateReportValidator, validateRequest, catchAsync(adminController.updateReport));
router.delete("/reports/:id", requireAdminRole("superadmin"), reportIdValidator, validateRequest, catchAsync(adminController.deleteReport));

router.get("/settings", catchAsync(adminController.getSettings));
router.put("/settings", requireAdminRole("superadmin"), settingsValidator, validateRequest, catchAsync(adminController.updateSettings));

module.exports = router;
