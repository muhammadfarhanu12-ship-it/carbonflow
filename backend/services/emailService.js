const { sendEmail } = require("../utils/mailer");

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function buildResetPasswordTemplate({ name, fullName, resetUrl }) {
  return {
    subject: "Reset your password",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2>Password reset request</h2>
        <p>Hello ${name || fullName || "there"},</p>
        <p>We received a request to reset your password. Click the button below to continue. This link expires in 1 hour.</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:8px;">
            Reset Password
          </a>
        </p>
        <p>If you did not request this, you can safely ignore this email.</p>
        <p>${resetUrl}</p>
      </div>
    `,
  };
}

function buildWelcomeTemplate({ name, fullName }) {
  const displayName = name || fullName || "there";

  return {
    subject: "Welcome to CarbonFlow",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2>Welcome ${displayName}!</h2>
        <p>Your CarbonFlow account has been created successfully.</p>
        <p>You can now sign in and start managing your sustainability workflows.</p>
      </div>
    `,
  };
}

function buildBudgetIncreaseTemplate({
  requesterName,
  requesterEmail,
  companyName,
  currentBudgetUsd,
  requestedBudgetUsd,
  remainingBudgetUsd,
  pendingTransactionsUsd,
  reason,
}) {
  const hasReason = String(reason || "").trim().length > 0;

  return {
    subject: `Budget increase request from ${companyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2>Marketplace Budget Increase Request</h2>
        <p><strong>Company:</strong> ${companyName}</p>
        <p><strong>Requested by:</strong> ${requesterName} (${requesterEmail})</p>
        <div style="margin: 16px 0; padding: 12px; border: 1px solid #d1fae5; border-radius: 10px; background: #ecfdf5;">
          <p style="margin: 0 0 8px;"><strong>Current Budget:</strong> ${formatCurrency(currentBudgetUsd)}</p>
          <p style="margin: 0 0 8px;"><strong>Requested Budget:</strong> ${formatCurrency(requestedBudgetUsd)}</p>
          <p style="margin: 0 0 8px;"><strong>Remaining Budget:</strong> ${formatCurrency(remainingBudgetUsd)}</p>
          <p style="margin: 0;"><strong>Pending Transactions:</strong> ${formatCurrency(pendingTransactionsUsd)}</p>
        </div>
        ${hasReason ? `<p><strong>Reason:</strong> ${String(reason).trim()}</p>` : ""}
        <p>Review this request in the admin panel and update the budget policy as needed.</p>
      </div>
    `,
  };
}

async function sendResetPasswordEmail({ to, name, fullName, resetUrl }) {
  const template = buildResetPasswordTemplate({ name, fullName, resetUrl });

  await sendEmail({
    to,
    subject: template.subject,
    html: template.html,
  });
}

async function sendWelcomeEmail({ to, name, fullName }) {
  const template = buildWelcomeTemplate({ name, fullName });

  await sendEmail({
    to,
    subject: template.subject,
    html: template.html,
  });
}

async function sendBudgetIncreaseRequestEmail(payload) {
  const template = buildBudgetIncreaseTemplate(payload);

  return sendEmail({
    to: payload.to,
    subject: template.subject,
    html: template.html,
  });
}

module.exports = {
  sendResetPasswordEmail,
  sendWelcomeEmail,
  sendBudgetIncreaseRequestEmail,
};
