const express = require("express");
const authController = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const { authRateLimiter, resendVerificationRateLimiter } = require("../middlewares/rateLimiter");

const router = express.Router();

router.post("/signup", authRateLimiter, authController.signupValidators, authController.signup);
router.post("/login", authRateLimiter, authController.loginValidators, authController.login);
router.post("/signin", authRateLimiter, authController.loginValidators, authController.login);
router.get("/verify-email", authController.verifyEmailGet);
router.post("/verify-email", authRateLimiter, authController.verifyEmailValidators, authController.verifyEmail);
router.post("/resend-verification", resendVerificationRateLimiter, authController.resendVerificationValidators, authController.resendVerification);
router.post("/forgot-password", authRateLimiter, authController.forgotPasswordValidators, authController.forgotPassword);
router.post("/reset-password", authRateLimiter, authController.resetPasswordValidators, authController.resetPassword);
router.post("/refresh-token", authRateLimiter, authController.refreshTokenValidators, authController.refreshToken);
router.get("/me", authenticate, authController.me);
router.post("/logout", authenticate, authController.logout);

module.exports = router;
