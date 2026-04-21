const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");
const { USER_ROLES, USER_STATUSES } = require("../constants/platform");

const PRIVATE_FIELDS = "+password +refreshTokenHash +passwordResetTokenHash +passwordResetExpiresAt";

const userSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 160 },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: USER_ROLES, default: "ANALYST" },
  status: { type: String, enum: USER_STATUSES, default: "ACTIVE" },
  lastLoginAt: { type: Date, default: null },
  refreshTokenHash: { type: String, select: false, default: null },
  passwordResetTokenHash: { type: String, select: false, default: null },
  passwordResetExpiresAt: { type: Date, select: false, default: null },
}, {
  collection: "users",
});

userSchema.virtual("company", {
  ref: "Company",
  localField: "companyId",
  foreignField: "_id",
  justOne: true,
});

userSchema.virtual("organizationId").get(function getOrganizationId() {
  return this.companyId;
});

userSchema.statics.scope = function scope(name) {
  if (name !== "withPassword") {
    return this;
  }

  return {
    findOne: (filter = {}) => this.findOne(filter).select(PRIVATE_FIELDS),
    findByPk: (id) => this.findById(id).select(PRIVATE_FIELDS),
  };
};

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
