require("dotenv").config({ quiet: true });

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return value === "true";
}

function parseList(value, fallback = []) {
  if (!value) {
    return fallback;
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasMongoPlaceholders(value) {
  const normalized = String(value || "");

  return [
    "<db_username>",
    "<db_password>",
    "username:password@cluster.mongodb.net",
  ].some((token) => normalized.includes(token));
}

const nodeEnv = process.env.NODE_ENV || "development";
const clientUrls = parseList(
  process.env.CLIENT_URLS,
  [process.env.CLIENT_URL || "http://localhost:5173"],
);
const adminClientUrls = parseList(
  process.env.ADMIN_CLIENT_URLS,
  [process.env.ADMIN_CLIENT_URL || "http://localhost:3001"],
);
const allowedOrigins = [...new Set([...clientUrls, ...adminClientUrls])];

const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  isTest: nodeEnv === "test",
  port: parseNumber(process.env.PORT, 5000),
  baseUrl: process.env.BASE_URL || "http://localhost:5000",
  clientUrl: clientUrls[0] || "http://localhost:5173",
  clientUrls,
  adminClientUrl: adminClientUrls[0] || "http://localhost:3001",
  adminClientUrls,
  allowedOrigins,
  mongoUri: process.env.MONGO_URI || "",
  mongoDbName: process.env.MONGO_DB_NAME || "carbon_footprint_app",
  database: {
    retryAttempts: parseNumber(process.env.MONGO_RETRY_ATTEMPTS, nodeEnv === "production" ? 5 : 3),
    retryDelayMs: parseNumber(process.env.MONGO_RETRY_DELAY_MS, nodeEnv === "production" ? 5000 : 2000),
    maxPoolSize: parseNumber(process.env.MONGO_MAX_POOL_SIZE, 10),
    serverSelectionTimeoutMs: parseNumber(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS, 5000),
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || "super-secret-change-me",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || "super-refresh-secret-change-me",
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
    bcryptSaltRounds: parseNumber(process.env.BCRYPT_SALT_ROUNDS, 12),
  },
  admin: {
    jwtSecret: process.env.ADMIN_JWT_SECRET || "admin-super-secret-change-me",
    jwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || "12h",
    bootstrapEmail: process.env.ADMIN_EMAIL || "admin@carbonflow.com",
    bootstrapPassword: process.env.ADMIN_PASSWORD || "Admin@12345",
  },
  mail: {
    host: parseString(process.env.SMTP_HOST, "smtp.gmail.com"),
    port: parseNumber(process.env.SMTP_PORT, 587),
    secure: parseBoolean(process.env.SMTP_SECURE, false),
    user: parseString(process.env.SMTP_USER, parseString(process.env.EMAIL_USER, "")),
    pass: parseString(process.env.SMTP_PASS, parseString(process.env.EMAIL_PASS, "")),
    from: parseString(process.env.FROM_EMAIL, parseString(process.env.EMAIL_FROM, "")),
  },
  seedOnBoot: parseBoolean(process.env.SEED_ON_BOOT, nodeEnv !== "production"),
  carbonPricePerTon: parseNumber(process.env.CARBON_PRICE_PER_TON, 55),
};

function validateEnv() {
  const missing = [];

  if (!process.env.MONGO_URI) {
    missing.push("MONGO_URI");
  }

  if (!process.env.JWT_SECRET) {
    missing.push("JWT_SECRET");
  }

  if (env.isProduction && env.clientUrls.length === 0) {
    missing.push("CLIENT_URLS");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (!/^mongodb(\+srv)?:\/\//.test(env.mongoUri)) {
    throw new Error("MONGO_URI is not a valid MongoDB connection string.");
  }

  if (hasMongoPlaceholders(env.mongoUri)) {
    throw new Error(
      "MONGO_URI still contains placeholder credentials. Replace <db_username> and <db_password> in backend/.env with your real MongoDB Atlas database user credentials.",
    );
  }

  if (env.isProduction && env.auth.jwtSecret === "super-secret-change-me") {
    throw new Error("JWT_SECRET must be changed before running in production.");
  }

  if (env.isProduction && env.auth.jwtRefreshSecret === "super-refresh-secret-change-me") {
    throw new Error("JWT_REFRESH_SECRET must be changed before running in production.");
  }

  if (env.isProduction && env.admin.jwtSecret === "admin-super-secret-change-me") {
    throw new Error("ADMIN_JWT_SECRET must be changed before running in production.");
  }
}

validateEnv();

module.exports = env;
module.exports.validateEnv = validateEnv;
