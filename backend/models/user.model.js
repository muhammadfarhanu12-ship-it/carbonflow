const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { withBaseSchema } = require("./helpers/model.utils");
const { USER_ROLES, USER_STATUSES } = require("../constants/platform");
const env = require("../config/env");

const PRIVATE_FIELDS = "+password +refreshTokenHash +passwordResetTokenHash +passwordResetExpiresAt +emailVerificationToken +emailVerificationExpires";

const userSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 160 },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: USER_ROLES, default: "ANALYST" },
  status: { type: String, enum: USER_STATUSES, default: "ACTIVE" },
  isVerified: { type: Boolean, default: false },
  lastLoginAt: { type: Date, default: null },
  refreshTokenHash: { type: String, select: false, default: null },
  passwordResetTokenHash: { type: String, select: false, default: null },
  passwordResetExpiresAt: { type: Date, select: false, default: null },
  emailVerificationToken: { type: String, select: false, default: null },
  emailVerificationExpires: { type: Date, select: false, default: null },
}, {
  collection: "users",
});

function isBcryptHash(value) {
  return /^\$2[abxy]\$\d{2}\$/.test(String(value || ""));
}

userSchema.pre("save", async function hashPasswordOnSave(next) {
  if (!this.isModified("password")) {
    return next();
  }

  if (isBcryptHash(this.password)) {
    return next();
  }

  try {
    this.password = await bcrypt.hash(String(this.password), env.auth.bcryptSaltRounds);
    return next();
  } catch (error) {
    return next(error);
  }
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

userSchema.index({ companyId: 1, role: 1, status: 1 });
userSchema.index(
  { emailVerificationToken: 1 },
  {
    sparse: true,
    partialFilterExpression: {
      emailVerificationToken: { $type: "string" },
    },
  },
);
userSchema.index(
  { passwordResetTokenHash: 1 },
  {
    sparse: true,
    partialFilterExpression: {
      passwordResetTokenHash: { $type: "string" },
    },
  },
);

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
