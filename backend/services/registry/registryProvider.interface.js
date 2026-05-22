class RegistryProvider {
  constructor(config = {}) {
    this.config = config;
  }

  get name() {
    return "base";
  }

  get supportsSubmitRetirement() {
    return false;
  }

  async submitRetirement() {
    throw new Error("Registry provider does not support retirement submission.");
  }

  async getRetirementStatus() {
    return {
      provider: this.name,
      status: "manual_verification_required",
      message: "Registry provider status lookup is not implemented.",
    };
  }
}

module.exports = RegistryProvider;
