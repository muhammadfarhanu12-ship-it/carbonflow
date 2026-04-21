const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Admin, AuditLog } = require("../../../models");
const env = require("../../../config/env");
const ApiError = require("../../../utils/ApiError");

function toSafeAdmin(admin) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    status: admin.status,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}

function signAdminToken(admin) {
  return jwt.sign(
    {
      role: admin.role,
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
    const admin = await Admin.findOne({ email: String(payload.email).toLowerCase() }).select("+passwordHash");

    if (!admin) {
      throw new ApiError(401, "Invalid admin credentials");
    }

    const isPasswordValid = await bcrypt.compare(payload.password, admin.passwordHash);
    if (!isPasswordValid) {
      throw new ApiError(401, "Invalid admin credentials");
    }

    if (admin.status !== "active") {
      throw new ApiError(403, "Admin account is disabled");
    }

    admin.lastLoginAt = new Date();
    await admin.save();

    await writeAuditLog("ADMIN_LOGIN", admin, {
      description: `${admin.email} signed into the admin portal`,
    });

    return {
      token: signAdminToken(admin),
      admin: toSafeAdmin(admin),
    };
  }

  static async register(payload, actor = null) {
    const existingAdmins = await Admin.countDocuments();
    const isBootstrapRegistration = existingAdmins === 0;

    if (!isBootstrapRegistration) {
      if (!actor) {
        throw new ApiError(403, "Admin registration is restricted");
      }

      if (actor.role !== "superadmin") {
        throw new ApiError(403, "Only superadmins can create new admin accounts");
      }
    }

    const email = String(payload.email).toLowerCase();
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      throw new ApiError(409, "An admin with that email already exists");
    }

    const role = isBootstrapRegistration ? "superadmin" : payload.role || "moderator";
    const passwordHash = await bcrypt.hash(payload.password, env.auth.bcryptSaltRounds);

    const admin = await Admin.create({
      name: payload.name,
      email,
      passwordHash,
      role,
      status: "active",
    });

    await writeAuditLog("ADMIN_REGISTERED", actor || admin, {
      description: `${admin.email} was added to the admin system`,
      targetAdminId: admin.id,
      targetAdminEmail: admin.email,
    });

    return toSafeAdmin(admin);
  }

  static async getAdminProfile(adminId) {
    const admin = await Admin.findById(adminId);
    if (!admin) {
      throw new ApiError(404, "Admin account not found");
    }

    return toSafeAdmin(admin);
  }

  static async changePassword(adminId, payload) {
    const admin = await Admin.findById(adminId).select("+passwordHash");
    if (!admin) {
      throw new ApiError(404, "Admin account not found");
    }

    const isPasswordValid = await bcrypt.compare(payload.currentPassword, admin.passwordHash);
    if (!isPasswordValid) {
      throw new ApiError(401, "Current password is incorrect");
    }

    admin.passwordHash = await bcrypt.hash(payload.newPassword, env.auth.bcryptSaltRounds);
    await admin.save();

    await writeAuditLog("ADMIN_PASSWORD_UPDATED", admin, {
      description: `${admin.email} updated their admin password`,
    });

    return toSafeAdmin(admin);
  }
}

module.exports = AdminAuthService;
