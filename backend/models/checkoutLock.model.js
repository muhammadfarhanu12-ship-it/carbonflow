const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const CHECKOUT_LOCK_STATUSES = ["ACTIVE", "COMPLETED", "RELEASED", "EXPIRED"];

const checkoutLockSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", required: true, index: true, immutable: true },
  projectId: { type: String, ref: "CarbonProject", required: true, index: true, immutable: true },
  transactionId: { type: String, ref: "Transaction", required: true, immutable: true },
  userId: { type: String, ref: "User", default: null, index: true, immutable: true },
  quantity: { type: Number, required: true, immutable: true },
  status: { type: String, enum: CHECKOUT_LOCK_STATUSES, default: "ACTIVE", index: true },
  expiresAt: { type: Date, required: true, index: true },
  releasedAt: { type: Date, default: null },
  releaseReason: { type: String, default: null, trim: true },
}, {
  collection: "checkout_locks",
});

checkoutLockSchema.index(
  { transactionId: 1 },
  {
    unique: true,
  },
);
checkoutLockSchema.index({ companyId: 1, projectId: 1, status: 1, expiresAt: 1 });

module.exports = mongoose.models.CheckoutLock || mongoose.model("CheckoutLock", checkoutLockSchema);
