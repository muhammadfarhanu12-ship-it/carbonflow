const nodemailer = require("nodemailer");
const env = require("../config/env");
const logger = require("./logger");

let transporter = null;
const SMTP_TIMEOUT_MS = 10000;

function isMailerConfigured() {
  return Boolean(env.mail.user && env.mail.pass);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.secure,
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
      auth: {
        user: env.mail.user,
        pass: env.mail.pass,
      },
    });
  }

  return transporter;
}

async function sendEmail({ to, subject, html, text }) {
  if (!isMailerConfigured()) {
    logger.warn("email.skipped", {
      reason: "smtp_not_configured",
      to,
      subject,
    });
    return null;
  }

  const info = await getTransporter().sendMail({
    from: env.mail.from || env.mail.user,
    to,
    subject,
    html,
    text,
  });

  logger.info("email.sent", {
    to,
    subject,
    messageId: info.messageId,
  });

  return info;
}

module.exports = {
  sendEmail,
  isMailerConfigured,
};
