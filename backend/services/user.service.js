const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { User } = require("../models");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const { getPagination, formatPaginatedResponse } = require("../utils/pagination");
const { USER_ROLES } = require("../constants/platform");
const AuditService = require("./audit.service");

function toSafeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: Boolean(user.isVerified),
    companyId: user.companyId || null,
    organizationId: user.companyId || null,
    company: user.company || null,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function isPrivileged(role) {
  return ["OWNER", "ADMIN", "MANAGER", "SUPERADMIN"].includes(String(role || "").toUpperCase());
}

function canAssignRole(requesterRole, nextRole) {
  const normalizedRequesterRole = String(requesterRole || "").toUpperCase();
  const normalizedNextRole = String(nextRole || "").toUpperCase();

  if (!USER_ROLES.includes(normalizedNextRole)) {
    return false;
  }

  if (["SUPERADMIN", "OWNER"].includes(normalizedRequesterRole)) {
    return true;
  }

  if (normalizedRequesterRole === "ADMIN") {
    return !["SUPERADMIN", "OWNER"].includes(normalizedNextRole);
  }

  if (normalizedRequesterRole === "MANAGER") {
    return ["ANALYST", "USER", "DATA_ENTRY", "VIEWER", "AUDITOR"].includes(normalizedNextRole);
  }

  return false;
}

async function ensureUniqueEmail(email, excludeId = null) {
  if (!email) {
    return;
  }

  const existingUser = await User.findOne({
    email,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  });

  if (existingUser) {
    throw new ApiError(409, "A user with that email already exists");
  }
}

class UserService {
  static async getCurrentUser(userId) {
    const user = await User.findById(userId).populate("company");
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return toSafeUser(user);
  }

  static async listUsers(requester, query = {}) {
    if (!isPrivileged(requester.role)) {
      throw new ApiError(403, "You do not have permission to list users");
    }

    const { page, pageSize, offset, limit } = getPagination(query);
    const filter = requester.role === "SUPERADMIN"
      ? {}
      : { companyId: requester.companyId };

    if (query.role) {
      filter.role = String(query.role).toUpperCase();
    }

    const [count, rows] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).populate("company"),
    ]);

    return formatPaginatedResponse({
      rows: rows.map((user) => toSafeUser(user)),
      count,
      page,
      pageSize,
    });
  }

  static async createUser(payload, requester) {
    if (!isPrivileged(requester.role)) {
      throw new ApiError(403, "You do not have permission to create users");
    }

    const nextRole = String(payload.role || "ANALYST").toUpperCase();
    if (!canAssignRole(requester.role, nextRole)) {
      throw new ApiError(403, "You do not have permission to assign that role");
    }

    await ensureUniqueEmail(payload.email);
    const plainPassword = payload.password || crypto.randomBytes(12).toString("base64url");
    const passwordHash = await bcrypt.hash(plainPassword, env.auth.bcryptSaltRounds);

    const user = await User.create({
      companyId: requester.companyId,
      name: payload.name,
      email: payload.email,
      password: passwordHash,
      role: nextRole,
      status: payload.status || "INVITED",
      isVerified: true,
    });

    const createdUser = await User.findById(user.id).populate("company");
    await AuditService.log({
      companyId: requester.companyId,
      userId: requester.id,
      userEmail: requester.email,
      action: "user_invited",
      entityType: "User",
      entityId: user.id,
      details: {
        createdUserId: user.id,
        role: nextRole,
        invited: !payload.password,
      },
    });

    return toSafeUser(createdUser);
  }

  static async getUserById(id, requester) {
    if (!isPrivileged(requester.role) && requester.id !== id) {
      throw new ApiError(403, "You do not have permission to view this user");
    }

    const filter = {
      _id: id,
    };

    if (requester.role !== "SUPERADMIN" && requester.id !== id) {
      filter.companyId = requester.companyId;
    }

    const user = await User.findOne(filter).populate("company");
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return toSafeUser(user);
  }

  static async updateCurrentUser(userId, payload) {
    const user = await User.findById(userId).select("+password").populate("company");
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    if (payload.email && payload.email !== user.email) {
      throw new ApiError(422, "Email changes require the dedicated verification workflow.");
    }

    if (payload.newPassword) {
      const isValid = await bcrypt.compare(payload.currentPassword || "", user.password);
      if (!isValid) {
        throw new ApiError(422, "Current password is incorrect");
      }

      user.password = await bcrypt.hash(payload.newPassword, env.auth.bcryptSaltRounds);
      await AuditService.log({
        companyId: user.companyId,
        userId: user.id,
        userEmail: user.email,
        action: "password_changed",
        entityType: "User",
        entityId: user.id,
        severity: "critical",
        category: "security",
      });
    }

    if (payload.name) {
      user.name = payload.name;
    }

    await user.save();
    await AuditService.log({
      companyId: user.companyId,
      userId: user.id,
      userEmail: user.email,
      action: "profile_updated",
      entityType: "User",
      entityId: user.id,
      newValue: { name: user.name },
    });
    return toSafeUser(await User.findById(userId).populate("company"));
  }

  static async updateUser(id, payload, requester) {
    if (!isPrivileged(requester.role)) {
      throw new ApiError(403, "You do not have permission to update users");
    }

    const filter = requester.role === "SUPERADMIN"
      ? { _id: id }
      : { _id: id, companyId: requester.companyId };

    const user = await User.findOne(filter).select("+password");
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    if (!canAssignRole(requester.role, user.role) && requester.role !== "SUPERADMIN") {
      throw new ApiError(403, "You do not have permission to manage this user");
    }

    if (payload.email && payload.email !== user.email) {
      await ensureUniqueEmail(payload.email, id);
    }

    if (payload.role && !canAssignRole(requester.role, payload.role)) {
      throw new ApiError(403, "You do not have permission to assign that role");
    }

    if (payload.role && id === requester.id && ["OWNER", "ADMIN", "SUPERADMIN"].includes(String(user.role).toUpperCase())) {
      const remainingAdmins = await User.countDocuments({
        companyId: requester.companyId,
        _id: { $ne: id },
        role: { $in: ["OWNER", "ADMIN", "SUPERADMIN"] },
        status: "ACTIVE",
      });
      if (remainingAdmins === 0) {
        throw new ApiError(422, "You cannot demote yourself as the last workspace administrator.");
      }
    }

    const oldValue = {
      role: user.role,
      status: user.status,
      name: user.name,
      email: user.email,
    };

    Object.assign(user, {
      name: payload.name ?? user.name,
      email: payload.email ?? user.email,
      role: payload.role ?? user.role,
      status: payload.status ?? user.status,
    });

    if (payload.password) {
      user.password = await bcrypt.hash(payload.password, env.auth.bcryptSaltRounds);
    }

    await user.save();
    const updatedUser = await User.findById(id).populate("company");
    const roleChanged = payload.role && String(payload.role).toUpperCase() !== String(oldValue.role).toUpperCase();
    await AuditService.log({
      companyId: requester.companyId,
      userId: requester.id,
      userEmail: requester.email,
      action: roleChanged ? "user_role_changed" : (payload.status === "SUSPENDED" ? "user_deactivated" : "user_updated"),
      entityType: "User",
      entityId: id,
      oldValue,
      newValue: {
        role: updatedUser.role,
        status: updatedUser.status,
        name: updatedUser.name,
        email: updatedUser.email,
      },
      details: {
        role: updatedUser.role,
        status: updatedUser.status,
      },
    });
    return toSafeUser(updatedUser);
  }

  static async deleteUser(id, requester) {
    if (!isPrivileged(requester.role)) {
      throw new ApiError(403, "You do not have permission to delete users");
    }

    const filter = requester.role === "SUPERADMIN"
      ? { _id: id }
      : { _id: id, companyId: requester.companyId };

    const user = await User.findOne(filter);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    if (!canAssignRole(requester.role, user.role) && requester.role !== "SUPERADMIN") {
      throw new ApiError(403, "You do not have permission to delete this user");
    }

    if (["OWNER", "ADMIN", "SUPERADMIN"].includes(String(user.role).toUpperCase())) {
      const remainingAdmins = await User.countDocuments({
        companyId: requester.companyId,
        _id: { $ne: id },
        role: { $in: ["OWNER", "ADMIN", "SUPERADMIN"] },
        status: "ACTIVE",
      });
      if (remainingAdmins === 0) {
        throw new ApiError(422, "Cannot remove the last workspace administrator.");
      }
    }

    await user.deleteOne();
    await AuditService.log({
      companyId: requester.companyId,
      userId: requester.id,
      userEmail: requester.email,
      action: "user.deleted",
      entityType: "User",
      entityId: id,
      details: { deletedUserId: id },
    });
    return { id };
  }
}

module.exports = UserService;
