const nodemailer = require("nodemailer");
const env = require("../config/env");
const logger = require("./logger");

let transporter = null;
const SMTP_TIMEOUT_MS = 10000;

class EmailDeliveryError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "EmailDeliveryError";
    this.statusCode = 503;
    this.code = options.code || "EMAIL_DELIVERY_FAILED";
    this.provider = options.provider || null;
    this.details = options.details;
    this.cause = options.cause;
  }
}

function isMailerConfigured() {
  return Boolean(env.mail.user && env.mail.pass);
}

function getProviderLabel() {
  const host = String(env.mail.host || "smtp").trim() || "smtp";
  const port = Number(env.mail.port) || 0;
  return port > 0 ? `${host}:${port}` : host;
}

function buildConfigurationError() {
  return new EmailDeliveryError(
    "Email provider is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in backend/.env before sending authentication emails.",
    {
      code: "EMAIL_PROVIDER_NOT_CONFIGURED",
      provider: getProviderLabel(),
    },
  );
}

function normalizeMailerError(error) {
  const provider = getProviderLabel();
  const code = String(error?.code || "").toUpperCase();
  const responseCode = Number(error?.responseCode || 0);

  if (code === "EAUTH" || responseCode === 535) {
    return new EmailDeliveryError(
      `Email provider authentication failed for ${provider}. Check SMTP_USER, SMTP_PASS, and the provider account/app-password settings.`,
      {
        code: "EMAIL_PROVIDER_AUTH_FAILED",
        provider,
        cause: error,
      },
    );
  }

  if (code === "ECONNECTION" || code === "ETIMEDOUT" || code === "ESOCKET") {
    return new EmailDeliveryError(
      `Email provider ${provider} could not be reached. Check SMTP_HOST, SMTP_PORT, SMTP_SECURE, firewall access, and provider availability.`,
      {
        code: "EMAIL_PROVIDER_UNREACHABLE",
        provider,
        cause: error,
      },
    );
  }

  return new EmailDeliveryError(
    `Email provider ${provider} failed to send the message${error?.message ? `: ${error.message}` : "."}`,
    {
      code: "EMAIL_PROVIDER_SEND_FAILED",
      provider,
      cause: error,
    },
  );
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
    const configError = buildConfigurationError();
    logger.error("email.failed", {
      reason: configError.code,
      to,
      subject,
      provider: configError.provider,
    });
    throw configError;
  }

  try {
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
      provider: getProviderLabel(),
    });

    return info;
  } catch (error) {
    const normalizedError = normalizeMailerError(error);
    logger.error("email.failed", {
      to,
      subject,
      provider: normalizedError.provider,
      code: normalizedError.code,
      message: normalizedError.message,
      cause: error?.message,
      stack: env.isProduction ? undefined : error?.stack,
    });
    throw normalizedError;
  }
}

module.exports = {
  EmailDeliveryError,
  sendEmail,
  isMailerConfigured,
};
