const bcrypt = require("bcryptjs");
const { connectDB } = require("../config/db");
const { Admin } = require("../models");
const env = require("../config/env");
const logger = require("../utils/logger");

async function seedAdminUser() {
  await connectDB();

  const email = env.admin.bootstrapEmail;
  const password = env.admin.bootstrapPassword;

  const existingAdmin = await Admin.findOne({ email });
  if (existingAdmin) {
    logger.info("seed.admin.exists", { email });
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await Admin.create({
    name: "Platform Admin",
    email,
    passwordHash,
    role: "superadmin",
    status: "active",
  });

  logger.info("seed.admin.created", { email });
  process.exit(0);
}

seedAdminUser().catch((error) => {
  logger.error("seed.admin.failed", {
    error: error.message,
    stack: env.isProduction ? undefined : error.stack,
  });
  process.exit(1);
});
