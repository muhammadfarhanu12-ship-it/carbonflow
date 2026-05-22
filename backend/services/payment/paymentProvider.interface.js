class PaymentProvider {
  constructor(config = {}) {
    this.config = config;
  }

  get name() {
    return "base";
  }

  get supportsInvoices() {
    return false;
  }

  async createInvoice() {
    throw new Error("Payment provider does not support invoices.");
  }
}

module.exports = PaymentProvider;
