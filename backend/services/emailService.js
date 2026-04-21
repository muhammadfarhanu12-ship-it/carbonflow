const { sendEmail } = require("../utils/mailer");

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

module.exports = {
  sendResetPasswordEmail,
  sendWelcomeEmail,
};
