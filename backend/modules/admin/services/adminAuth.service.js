const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User, AuditLog } = require("../../../models");
const env = require("../../../config/env");
const ApiError = require("../../../utils/ApiError");
const {
  getAdminPermissionsForRole,
  isPlatformAdmin,
  normalizeAdminRole,
  normalizeAdminStatus,
  toAdminSessionUser,
} = require("../adminAccess");

function signAdminToken(admin) {
  return jwt.sign(
    {
      role: normalizeAdminRole(admin.adminRole),
      type: "admin",
    },
    env.admin.jwtSecret,
    {
      subject: admin.id,
      expiresIn: env.admin.jwtExpiresIn,
    },
  );
}

async function writeAuditLog(action, admin, details = {}) {
  try {
    await AuditLog.create({
      action,
      details: {
        ...details,
        actorType: "admin",
        actorId: admin?.id || null,
        actorEmail: admin?.email || null,
      },
    });
  } catch (_error) {
    // Audit logging should never block admin authentication flows.
  }
}

class AdminAuthService {
  static async login(payload) {
    const email = String(payload.email || "").trim().toLowerCase();
    const user = await User.scope("withPassword").findOne({ email });

    if (!user) {
      throw new ApiError(401, "Invalid admin credentials");
    }

    if (user.status === "SUSPENDED") {
      throw new ApiError(403, "Your account has been suspended");
    }

    const isPasswordValid = await bcrypt.compare(payload.password, user.password);
    if (!isPasswordValid) {
      throw new ApiError(401, "Invalid admin credentials");
    }

    if (!isPlatformAdmin(user)) {
      throw new ApiError(403, "This account does not have admin panel access.");
    }

    if (normalizeAdminStatus(user.adminStatus) !== "active") {
      throw new ApiError(403, "Admin account is disabled");
    }

    if (user.isVerified === false) {
      throw new ApiError(403, "Please verify your email before logging in to the admin panel");
    }

    const loginAt = new Date();
    user.lastLoginAt = loginAt;
    user.adminLastLoginAt = loginAt;
    user.adminPermissions = getAdminPermissionsForRole(user.adminRole);
    await user.save();

    await writeAuditLog("ADMIN_LOGIN", user, {
      description: `${user.email} signed into the admin portal`,
    });

    return {
      token: signAdminToken(user),
      admin: toAdminSessionUser(user),
    };
  }

  static async getAdminProfile(adminId) {
    const admin = await User.findById(adminId);
    if (!admin || !isPlatformAdmin(admin)) {
      throw new ApiError(404, "Admin account not found");
    }

    if (normalizeAdminStatus(admin.adminStatus) !== "active") {
      throw new ApiError(403, "Admin account is disabled");
    }

    return toAdminSessionUser(admin);
  }

  static async changePassword(adminId, payload) {
    const admin = await User.scope("withPassword").findByPk(adminId);
    if (!admin || !isPlatformAdmin(admin)) {
      throw new ApiError(404, "Admin account not found");
    }

    const isPasswordValid = await bcrypt.compare(payload.currentPassword, admin.password);
    if (!isPasswordValid) {
      throw new ApiError(401, "Current password is incorrect");
    }

    admin.password = payload.newPassword;
    admin.forcePasswordChange = false;
    await admin.save();

    await writeAuditLog("ADMIN_PASSWORD_UPDATED", admin, {
      description: `${admin.email} updated their admin password`,
    });

    return toAdminSessionUser(admin);
  }
}

module.exports = AdminAuthService;
