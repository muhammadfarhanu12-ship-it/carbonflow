const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const platformSettingSchema = withBaseSchema({
  platformName: { type: String, required: true, trim: true, default: "CarbonFlow" },
  supportEmail: { type: String, required: true, trim: true, default: "support@carbonflow.com" },
  sessionTimeoutMinutes: { type: Number, default: 60 },
  maintenanceMode: { type: Boolean, default: false },
  allowSelfSignup: { type: Boolean, default: true },
}, {
  collection: "platform_settings",
});

module.exports = mongoose.models.PlatformSetting || mongoose.model("PlatformSetting", platformSettingSchema);
