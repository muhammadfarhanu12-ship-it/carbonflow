const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const userLogSchema = withBaseSchema({
  userId: { type: String, ref: "User", default: null },
  action: { type: String, default: null },
  metadata: { type: Object, default: null },
}, {
  collection: "user_logs",
});

module.exports = mongoose.models.UserLog || mongoose.model("UserLog", userLogSchema);
