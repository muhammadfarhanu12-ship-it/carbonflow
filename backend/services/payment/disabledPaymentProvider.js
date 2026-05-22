const PaymentProvider = require("./paymentProvider.interface");

class DisabledPaymentProvider extends PaymentProvider {
  get name() {
    return "disabled";
  }

  async createInvoice() {
    return {
      provider: this.name,
      status: "pending",
      invoiceNumber: null,
      invoiceUrl: null,
      paymentReference: null,
      message: "Payment provider not configured.",
    };
  }
}

module.exports = DisabledPaymentProvider;
