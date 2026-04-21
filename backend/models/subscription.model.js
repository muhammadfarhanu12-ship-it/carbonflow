const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const subscriptionSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", default: null },
  plan: { type: String, default: null },
  price: { type: Number, default: 0 },
  status: { type: String, default: null },
}, {
  collection: "subscriptions",
});

module.exports = mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
