require("dotenv").config();

const mongoose = require("mongoose");
const env = require("../config/env");
const { User } = require("../models");
const UserContextService = require("../services/userContext.service");
const AuditService = require("../services/audit.service");

function getFlag(name) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

async function main() {
  const email = getFlag("email").toLowerCase();
  const role = String(getFlag("role") || "OWNER").toUpperCase();

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required to run make-owner.");
  }

  if (!email) {
    throw new Error('Usage: npm run make-owner -- --email="user@example.com" [--role=OWNER|ADMIN]');
  }

  if (!["OWNER", "ADMIN"].includes(role)) {
    throw new Error("Role must be OWNER or ADMIN.");
  }

  await mongoose.connect(env.mongoUri, {
    dbName: env.mongoDbName,
  });

  const user = await User.findOne({ email });
  if (!user) {
    throw new Error(`No user found for ${email}.`);
  }

  const before = {
    role: user.role,
    status: user.status,
    companyId: user.companyId || null,
  };

  const hydratedUser = user.companyId
    ? await UserContextService.ensureCompanyContext(user)
    : await UserContextService.provisionCompanyForUser(user);

  hydratedUser.role = role;
  hydratedUser.status = "ACTIVE";
  await hydratedUser.save();

  await AuditService.log({
    companyId: hydratedUser.companyId || null,
    userId: hydratedUser.id,
    userEmail: hydratedUser.email,
    action: "admin_repair_script_used",
    entityType: "User",
    entityId: hydratedUser.id,
    source: "system",
    oldValue: before,
    newValue: {
      role: hydratedUser.role,
      status: hydratedUser.status,
      companyId: hydratedUser.companyId || null,
    },
    details: {
      script: "make-owner",
      requestedRole: role,
    },
  });

  console.log(`Promoted ${hydratedUser.email} to ${hydratedUser.role} for company ${hydratedUser.companyId}.`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
