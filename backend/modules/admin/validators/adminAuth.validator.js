const { body } = require("express-validator");

const passwordRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const loginValidator = [
  body("email").trim().isEmail().withMessage("A valid admin email is required"),
  body("password").isString().notEmpty().withMessage("Password is required"),
];

const registerValidator = [
  body("name").trim().isLength({ min: 2, max: 120 }).withMessage("Name must be between 2 and 120 characters"),
  body("email").trim().isEmail().withMessage("A valid admin email is required"),
  body("password")
    .isString()
    .matches(passwordRule)
    .withMessage("Password must be at least 8 characters and include uppercase, lowercase, and a number"),
  body("role").optional().isIn(["superadmin", "moderator"]).withMessage("Role must be superadmin or moderator"),
];

const changePasswordValidator = [
  body("currentPassword").isString().notEmpty().withMessage("Current password is required"),
  body("newPassword")
    .isString()
    .matches(passwordRule)
    .withMessage("New password must be at least 8 characters and include uppercase, lowercase, and a number"),
];

module.exports = {
  loginValidator,
  registerValidator,
  changePasswordValidator,
};
