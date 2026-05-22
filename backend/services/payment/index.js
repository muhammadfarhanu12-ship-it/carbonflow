const env = require("../../config/env");
const DisabledPaymentProvider = require("./disabledPaymentProvider");
const ManualInvoiceProvider = require("./manualInvoiceProvider");

function getPaymentProvider() {
  const provider = String(env.payment?.provider || "disabled").toLowerCase();

  if (provider === "manual_invoice") {
    return new ManualInvoiceProvider(env.payment);
  }

  return new DisabledPaymentProvider(env.payment);
}

module.exports = {
  getPaymentProvider,
};
