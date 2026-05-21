const express = require("express");
const { body } = require("express-validator");
const catchAsync = require("../utils/catchAsync");
const validateRequest = require("../middlewares/validateRequest");
const { authenticate } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/rbac");
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

router.get("/", requirePermission("user:manage"), catchAsync(controller.listUsers));
router.post("/", requirePermission("user:manage"), [
  body("name").trim().isLength({ min: 2, max: 120 }),
  body("email").trim().normalizeEmail().isEmail(),
  body("password").optional().isString().isLength({ min: 8 }),
  body("role").optional().isIn(USER_ROLES),
  body("status").optional().isIn(USER_STATUSES),
], validateRequest, catchAsync(controller.createUser));
router.get("/:id", catchAsync(controller.getUserById));
router.put("/:id", requirePermission("user:manage"), [
  body("name").optional().trim().isLength({ min: 2, max: 120 }),
  body("email").optional().trim().normalizeEmail().isEmail(),
  body("password").optional().isString().isLength({ min: 8 }),
  body("role").optional().isIn(USER_ROLES),
  body("status").optional().isIn(USER_STATUSES),
], validateRequest, catchAsync(controller.updateUser));
router.delete("/:id", requirePermission("user:manage"), catchAsync(controller.deleteUser));

module.exports = router;
