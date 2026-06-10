const express = require("express");
const { body } = require("express-validator");
const catchAsync = require("../utils/catchAsync");
const validateRequest = require("../middlewares/validateRequest");
const { authenticate } = require("../middlewares/authMiddleware");
const { requirePermission, requireAnyPermission } = require("../middlewares/rbac");
const controller = require("../controllers/user.controller");
const { USER_ROLES, USER_STATUSES } = require("../constants/platform");

const router = express.Router();

router.use(authenticate);

router.get("/me", catchAsync(controller.getCurrentUser));
router.put("/me", [
  body("name").optional().trim().isLength({ min: 2, max: 120 }),
  body("email").optional().trim().normalizeEmail().isEmail(),
  body("currentPassword").optional().isString().isLength({ min: 8 }),
  body("newPassword").optional().isString().isLength({ min: 8 }),
], validateRequest, catchAsync(controller.updateCurrentUser));

const requireTeamManagement = requireAnyPermission(["user:manage", "settings:team:manage"]);

router.get("/", requireTeamManagement, catchAsync(controller.listUsers));
router.get("/team", requireTeamManagement, catchAsync(controller.listTeamMembers));
router.get("/invites", requireTeamManagement, catchAsync(controller.listPendingInvites));
router.post("/", requireTeamManagement, [
  body("name").trim().isLength({ min: 2, max: 120 }),
  body("email").trim().normalizeEmail().isEmail(),
  body("password").optional().isString().isLength({ min: 8 }),
  body("role").optional().isIn(USER_ROLES),
  body("status").optional().isIn(USER_STATUSES),
], validateRequest, catchAsync(controller.createUser));
router.post("/invite", requireTeamManagement, [
  body("name").trim().isLength({ min: 2, max: 120 }),
  body("email").trim().normalizeEmail().isEmail(),
  body("role").optional().isIn(USER_ROLES),
], validateRequest, catchAsync(controller.inviteUser));
router.get("/:id", catchAsync(controller.getUserById));
router.put("/:id", requireTeamManagement, [
  body("name").optional().trim().isLength({ min: 2, max: 120 }),
  body("email").optional().trim().normalizeEmail().isEmail(),
  body("password").optional().isString().isLength({ min: 8 }),
  body("role").optional().isIn(USER_ROLES),
  body("status").optional().isIn(USER_STATUSES),
], validateRequest, catchAsync(controller.updateUser));
router.patch("/:id/role", requireTeamManagement, [
  body("role").isIn(USER_ROLES),
], validateRequest, catchAsync(controller.updateUserRole));
router.patch("/:id/status", requireTeamManagement, [
  body("status").isIn(USER_STATUSES),
], validateRequest, catchAsync(controller.updateUserStatus));
router.post("/invites/:id/resend", requireTeamManagement, catchAsync(controller.resendInvite));
router.patch("/invites/:id/cancel", requireTeamManagement, catchAsync(controller.cancelInvite));
router.delete("/:id", requireTeamManagement, catchAsync(controller.deleteUser));

module.exports = router;
