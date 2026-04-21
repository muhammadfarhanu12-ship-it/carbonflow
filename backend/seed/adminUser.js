const bcrypt = require("bcryptjs");
const { connectDB } = require("../config/db");
const { Admin } = require("../models");
const env = require("../config/env");

async function seedAdminUser() {
  await connectDB();

  const email = env.admin.bootstrapEmail;
  const password = env.admin.bootstrapPassword;

  const existingAdmin = await Admin.findOne({ email });
  if (existingAdmin) {
    console.log(`[seed] admin account already exists for ${email}`);
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

  console.log(`[seed] admin account created for ${email}`);
  process.exit(0);
}

seedAdminUser().catch((error) => {
  console.error("[seed] failed to create admin account", error);
  process.exit(1);
});
