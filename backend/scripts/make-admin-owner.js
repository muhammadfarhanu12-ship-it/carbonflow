require("dotenv").config();

const { connectDB, closeDB } = require("../config/db");
const { User } = require("../models");
const {
  getAdminPermissionsForRole,
  normalizeAdminRole,
} = require("../modules/admin/adminAccess");

function readOption(argv, name) {
  const prefix = `--${name}=`;
  const match = argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function hasFlag(argv, name) {
  return argv.includes(`--${name}`);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function parseArgs(argv = process.argv.slice(2)) {
  return {
    email: normalizeEmail(readOption(argv, "email")),
    password: readOption(argv, "password"),
    create: hasFlag(argv, "create"),
    role: normalizeAdminRole(readOption(argv, "role") || "SUPER_ADMIN") || "SUPER_ADMIN",
  };
}

async function makeAdminOwner(options, deps = {}) {
  const connect = deps.connectDB || connectDB;
  const disconnect = deps.closeDB || closeDB;
  const UserModel = deps.UserModel || User;
  const now = deps.now || (() => new Date());

  const email = normalizeEmail(options.email);
  if (!email) {
    throw new Error('Usage: npm run make-admin-owner -- --email="user@example.com" [--create --password="strong-password"] [--role=SUPER_ADMIN|ADMIN|SUPPORT]');
  }

  const adminRole = normalizeAdminRole(options.role || "SUPER_ADMIN");
  if (!adminRole) {
    throw new Error("Role must be SUPER_ADMIN, ADMIN, or SUPPORT.");
  }

  const shouldCreate = Boolean(options.create);
  if (shouldCreate && !String(options.password || "").trim()) {
    throw new Error("--password is required when using --create.");
  }

  await connect();

  try {
    let user = await UserModel.findOne({ email });
    const adminPermissions = getAdminPermissionsForRole(adminRole);
    const promotedAt = now();
    let created = false;
    const previousAdminRole = user?.adminRole || null;

    if (!user) {
      if (!shouldCreate) {
        throw new Error(`No user found for ${email}. Re-run with --create to create a new platform admin user.`);
      }

      user = await UserModel.create({
        name: "Platform Admin",
        email,
        password: options.password,
        role: "ANALYST",
        status: "ACTIVE",
        isVerified: true,
        isPlatformAdmin: true,
        adminRole,
        adminPermissions,
        adminStatus: "active",
        adminCreatedAt: promotedAt,
        adminLastLoginAt: null,
        forcePasswordChange: true,
      });
      created = true;
    } else {
      user.isPlatformAdmin = true;
      user.adminRole = adminRole;
      user.adminPermissions = adminPermissions;
      user.adminStatus = "active";
      user.adminCreatedAt = user.adminCreatedAt || promotedAt;
      user.forcePasswordChange = true;
      user.isVerified = true;
      await user.save();
    }

    return {
      email: user.email,
      oldAdminRole: previousAdminRole,
      newAdminRole: user.adminRole,
      adminStatus: user.adminStatus,
      created,
      promoted: !created,
    };
  } finally {
    await disconnect();
  }
}

async function runCli() {
  const result = await makeAdminOwner(parseArgs());
  console.log(`Admin owner updated for ${result.email}`);
  console.log(`Old admin role: ${result.oldAdminRole || "none"}`);
  console.log(`New admin role: ${result.newAdminRole}`);
  console.log(`Admin status: ${result.adminStatus}`);
  console.log(`Action: ${result.created ? "created" : "promoted"}`);
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  makeAdminOwner,
  parseArgs,
};
