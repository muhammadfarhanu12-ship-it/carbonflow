const env = require("../config/env");

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveActiveLevel() {
  const configured = String(process.env.LOG_LEVEL || "").trim().toLowerCase();
  if (configured in LEVELS) {
    return LEVELS[configured];
  }

  return env.isProduction ? LEVELS.info : LEVELS.debug;
}

const activeLevel = resolveActiveLevel();

function serialize(payload) {
  return JSON.stringify(payload, (_key, value) => {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
      };
    }

    return value;
  });
}

function shouldLog(level) {
  return LEVELS[level] >= activeLevel;
}

function write(level, message, meta = {}) {
  if (!shouldLog(level)) {
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  const line = serialize(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

const logger = {
  debug: (message, meta = {}) => write("debug", message, meta),
  info: (message, meta = {}) => write("info", message, meta),
  warn: (message, meta = {}) => write("warn", message, meta),
  error: (message, meta = {}) => write("error", message, meta),
};

module.exports = logger;
