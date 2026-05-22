const crypto = require("crypto");
const PaymentProvider = require("./paymentProvider.interface");

class ManualInvoiceProvider extends PaymentProvider {
  get name() {
    return "manual_invoice";
  }

  get supportsInvoices() {
    return true;
  }

  async createInvoice(transaction) {
    return {
      provider: this.name,
      status: "invoice_sent",
      invoiceNumber: `CF-INV-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      invoiceUrl: null,
      paymentReference: transaction?.paymentReference || null,
      message: "Manual invoice created. Payment must be verified by an admin.",
    };
  }
}

module.exports = ManualInvoiceProvider;
