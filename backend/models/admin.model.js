const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const adminSchema = withBaseSchema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 160 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["superadmin", "moderator"], default: "moderator" },
  status: { type: String, enum: ["active", "disabled"], default: "active" },
  lastLoginAt: { type: Date, default: null },
}, {
  collection: "admins",
});

module.exports = mongoose.models.Admin || mongoose.model("Admin", adminSchema);
