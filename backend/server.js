require("dotenv").config({ quiet: true });

const http = require("http");
const { Server } = require("socket.io");
const { connectDB, closeDB } = require("./config/db");
const env = require("./config/env");
const { createApp, buildCorsOriginValidator } = require("./app");
const { seedDatabase } = require("./seed");
const logger = require("./utils/logger");

const registerDashboardSocket = require("./sockets/dashboard.socket");
const registerLedgerSocket = require("./sockets/ledger.socket");
const registerMarketplaceSocket = require("./sockets/marketplace.socket");
const registerReportsSocket = require("./sockets/reports.socket");
const registerSettingsSocket = require("./sockets/settings.socket");
const registerShipmentSocket = require("./sockets/shipment.socket");
const registerSupplierSocket = require("./sockets/supplier.socket");

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: buildCorsOriginValidator(env.allowedOrigins),
    credentials: true,
  },
});

app.locals.io = io;

io.on("connection", (socket) => {
  const origin = socket.handshake.headers.origin || "unknown-origin";
  logger.info("socket.connected", {
    socketId: socket.id,
    origin,
  });

  socket.on("disconnect", (reason) => {
    logger.info("socket.disconnected", {
      socketId: socket.id,
      reason,
    });
  });
});

registerDashboardSocket(io);
registerLedgerSocket(io);
registerMarketplaceSocket(io);
registerReportsSocket(io);
registerSettingsSocket(io);
registerShipmentSocket(io);
registerSupplierSocket(io);

function logStartupBanner() {
  logger.info("server.started", {
    port: env.port,
    baseUrl: `http://localhost:${env.port}`,
    apiBase: `http://localhost:${env.port}/api`,
    healthUrl: `http://localhost:${env.port}/api/health`,
  });
}

function handleServerError(error) {
  if (error.code === "EADDRINUSE") {
    logger.error("server.port_in_use", {
      port: env.port,
    });
    process.exit(1);
  }

  logger.error("server.runtime_error", {
    error: error.message,
    stack: env.isProduction ? undefined : error.stack,
  });
}

async function startServer() {
  server.on("error", handleServerError);

  await connectDB();

  if (env.seedOnBoot) {
    await seedDatabase();
  }

  await new Promise((resolve) => {
    server.listen(env.port, () => {
      logStartupBanner();
      resolve();
    });
  });
}

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info("server.shutdown_requested", { signal });

  try {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    await closeDB();
    process.exit(0);
  } catch (error) {
    logger.error("server.shutdown_failed", {
      error: error.message,
      stack: env.isProduction ? undefined : error.stack,
    });
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer().catch((error) => {
  logger.error("server.startup_failed", {
    error: error.message,
    stack: env.isProduction ? undefined : error.stack,
  });
  process.exit(1);
});
