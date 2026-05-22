const RegistryProvider = require("./registryProvider.interface");

class ManualRegistryProvider extends RegistryProvider {
  get name() {
    return "manual";
  }

  async submitRetirement() {
    return {
      provider: this.name,
      status: "manual_verification_required",
      retirementId: null,
      retirementUrl: null,
      retiredAt: null,
      responseSnapshot: {
        configured: true,
        message: "Manual registry provider requires an admin-entered verified retirement reference.",
      },
    };
  }

  async getRetirementStatus(transaction) {
    return {
      provider: this.name,
      status: transaction?.registryRetirementStatus || "manual_verification_required",
      retirementId: transaction?.registryRetirementId || null,
      retirementUrl: transaction?.registryRetirementUrl || null,
      retiredAt: transaction?.registryRetiredAt || null,
    };
  }
}

module.exports = ManualRegistryProvider;
