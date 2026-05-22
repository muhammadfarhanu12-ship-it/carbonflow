const env = require("../../config/env");
const DisabledRegistryProvider = require("./disabledRegistryProvider");
const ManualRegistryProvider = require("./manualRegistryProvider");

function getRegistryProvider() {
  const provider = String(env.registry?.provider || "disabled").toLowerCase();

  if (provider === "manual") {
    return new ManualRegistryProvider(env.registry);
  }

  return new DisabledRegistryProvider(env.registry);
}

module.exports = {
  getRegistryProvider,
};
