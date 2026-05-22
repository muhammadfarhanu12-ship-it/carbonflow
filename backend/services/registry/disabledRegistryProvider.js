const RegistryProvider = require("./registryProvider.interface");

class DisabledRegistryProvider extends RegistryProvider {
  get name() {
    return "disabled";
  }

  async submitRetirement() {
    return {
      provider: this.name,
      status: "manual_verification_required",
      retirementId: null,
      retirementUrl: null,
      retiredAt: null,
      responseSnapshot: {
        configured: false,
        message: "No registry provider is configured. No registry retirement has been completed.",
      },
    };
  }

  async getRetirementStatus() {
    return {
      provider: this.name,
      status: "manual_verification_required",
      message: "No registry provider is configured.",
    };
  }
}

module.exports = DisabledRegistryProvider;
