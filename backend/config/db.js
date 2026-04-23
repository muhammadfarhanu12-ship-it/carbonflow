const mongoose = require("mongoose");
const env = require("./env");
const logger = require("../utils/logger");

let connectionPromise = null;
let listenersBound = false;
let hasConnectedOnce = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bindConnectionEvents() {
  if (listenersBound) {
    return;
  }

  listenersBound = true;

  mongoose.connection.on("connected", () => {
    hasConnectedOnce = true;
    logger.info("db.mongoose_connected");
  });

  mongoose.connection.on("error", (error) => {
    if (hasConnectedOnce) {
      logger.error("db.mongoose_error", {
        message: formatConnectionError(error),
      });
    }
  });

  mongoose.connection.on("disconnected", () => {
    if (hasConnectedOnce) {
      logger.warn("db.mongoose_disconnected");
    }
  });
}

function extractDatabaseName(uri) {
  const normalized = String(uri || "");
  const withoutProtocol = normalized.replace(/^mongodb(\+srv)?:\/\//, "");
  const firstSlashIndex = withoutProtocol.indexOf("/");

  if (firstSlashIndex === -1) {
    return "";
  }

  const pathWithQuery = withoutProtocol.slice(firstSlashIndex + 1);
  return pathWithQuery.split("?")[0].trim();
}

function buildConnectionOptions() {
  const options = {
    maxPoolSize: env.database.maxPoolSize,
    serverSelectionTimeoutMS: env.database.serverSelectionTimeoutMs,
  };

  if (!extractDatabaseName(env.mongoUri) && env.mongoDbName) {
    options.dbName = env.mongoDbName;
  }

  return options;
}

function formatConnectionError(error) {
  const message = error?.message || "Unknown MongoDB error";

  if (/bad auth|authentication failed/i.test(message)) {
    return "MongoDB authentication failed. Update MONGO_URI in backend/.env with the real Atlas database username and password, and URL-encode special password characters.";
  }

  if (/ENOTFOUND|getaddrinfo/i.test(message)) {
    return "MongoDB host could not be reached. Verify the Atlas cluster hostname in MONGO_URI.";
  }

  if (/IP.*not.*whitelist|whitelist|not allowed to access/i.test(message)) {
    return "MongoDB Atlas rejected this IP. Add your current IP address, or 0.0.0.0/0 for testing, in Atlas Network Access.";
  }

  return message;
}

async function attemptConnection() {
  let lastError;

  for (let attempt = 1; attempt <= env.database.retryAttempts; attempt += 1) {
    try {
      const conn = await mongoose.connect(env.mongoUri, buildConnectionOptions());
      logger.info("db.mongodb_connected", {
        host: conn.connection.host,
      });
      return conn;
    } catch (error) {
      lastError = error;
      logger.error("db.mongodb_connection_attempt_failed", {
        attempt,
        totalAttempts: env.database.retryAttempts,
        message: formatConnectionError(error),
      });

      if (attempt < env.database.retryAttempts) {
        await sleep(env.database.retryDelayMs);
      }
    }
  }

  throw lastError;
}

async function connectDB() {
  bindConnectionEvents();

  if (!env.mongoUri) {
    throw new Error("MONGO_URI is missing. Set it in backend/.env before starting the server.");
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (mongoose.connection.readyState === 2 && connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = attemptConnection();

  try {
    return await connectionPromise;
  } finally {
    connectionPromise = null;
  }
}

async function closeDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    if (hasConnectedOnce) {
      logger.info("db.mongodb_disconnected");
    }
  }
}

module.exports = {
  connectDB,
  closeDB,
};
