require("./register-ts-runtime");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");
const env = require("./config/env");
const { apiRateLimiter } = require("./middlewares/rateLimiter");
const { sanitizeRequest } = require("./middlewares/sanitizeInput");
const { notFoundHandler, errorHandler } = require("./middlewares/errorHandler");
const logger = require("./utils/logger");

const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const usersRoutes = require("./routes/users.routes");
const projectsRoutes = require("./routes/projects.routes");
const companyRoutes = require("./routes/company.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const ledgerRoutes = require("./routes/ledger.routes");
const marketplaceRoutes = require("./routes/marketplace.routes");
const checkoutRoutes = require("./routes/checkout.routes");
const creditsRoutes = require("./routes/credits.routes");
const reportsRoutes = require("./routes/reports.routes");
const settingsRoutes = require("./routes/settings.routes");
const importRoutes = require("./routes/import.routes");
const shipmentRoutes = require("./routes/shipment.routes");
const shipmentEmissionsRoutes = require("./routes/shipmentEmissions.routes");
const supplierRoutes = require("./routes/supplier.routes");
const uploadRoutes = require("./routes/upload.routes");
const optimizationRoutes = require("./routes/optimization.routes");
const aiRoutes = require("./routes/ai.routes.ts");
const CheckoutLockService = require("./services/checkoutLock.service");
const PRODUCTION_FRONTEND_ORIGIN = "https://carbonflow-nu.vercel.app";

function normalizeOrigin(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  try {
    return new URL(normalized).origin;
  } catch {
    return normalized.replace(/\/+$/, "");
  }
}

function buildCorsOriginValidator(allowedOrigins) {
  if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0) {
    return true;
  }

  const normalizedAllowedOrigins = [...new Set(
    allowedOrigins
      .map((origin) => normalizeOrigin(origin))
      .filter(Boolean),
  )];
  if (normalizedAllowedOrigins.length === 0) {
    return true;
  }

  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = normalizeOrigin(origin);

    if (normalizedAllowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  };
}

function resolveCorsOrigins() {
  const strictProductionOrigin = normalizeOrigin(env.frontendUrl || PRODUCTION_FRONTEND_ORIGIN) || PRODUCTION_FRONTEND_ORIGIN;

  if (env.isProduction) {
    return [strictProductionOrigin];
  }

  return env.allowedOrigins;
}

function createApp() {
  const app = express();
  CheckoutLockService.startCleanupWorker();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  const corsOrigins = resolveCorsOrigins();
  const corsOptions = {
    origin: buildCorsOriginValidator(corsOrigins),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Idempotency-Key"],
  };

  app.use(helmet({
    crossOriginResourcePolicy: false,
  }));
  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(sanitizeRequest);
  app.use(apiRateLimiter);
  app.use(morgan(env.isProduction ? "combined" : "dev"));
  app.use((req, _res, next) => {
    req.io = req.app.locals.io || { emit: () => undefined };
    next();
  });
  app.use((req, res, next) => {
    const startedAt = Date.now();

    res.on("finish", () => {
      logger.info("request.completed", {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        origin: req.headers.origin || null,
      });
    });

    next();
  });

  const healthHandler = (_req, res) => {
    const isHealthy = mongoose.connection.readyState === 1;

    return res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? "OK" : "DEGRADED",
      service: "carbonflow-backend",
      environment: env.nodeEnv,
      database: {
        connected: isHealthy,
        name: mongoose.connection.name || env.mongoDbName,
        host: mongoose.connection.host || null,
        readyState: mongoose.connection.readyState,
      },
      timestamp: new Date().toISOString(),
    });
  };

  app.get("/health", healthHandler);
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "OK" });
  });

  if (!env.isProduction) {
    app.use("/auth", authRoutes);
  }
  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/projects", projectsRoutes);
  app.use("/api/company", companyRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/ledger", ledgerRoutes);
  app.use("/api/marketplace", marketplaceRoutes);
  app.use("/api/offsets", marketplaceRoutes);
  app.use("/api/checkout", checkoutRoutes);
  app.use("/api/credits", creditsRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/user/settings", settingsRoutes);
  app.use("/api/emissions", shipmentEmissionsRoutes);
  app.use("/api/shipments", importRoutes);
  app.use("/api/shipments", shipmentRoutes);
  app.use("/api/suppliers", supplierRoutes);
  app.use("/api/upload", uploadRoutes);
  app.use("/api/optimization", optimizationRoutes);
  app.use("/api/ai", aiRoutes);

  app.get("/", (_req, res) => {
    res.status(200).send("CarbonFlow API running");
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp,
  buildCorsOriginValidator,
  resolveCorsOrigins,
};
