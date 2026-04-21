require("dotenv").config({ quiet: true });

const http = require("http");
const { Server } = require("socket.io");
const { connectDB, closeDB } = require("./config/db");
const env = require("./config/env");
const { createApp, buildCorsOriginValidator } = require("./app");
const { seedDatabase } = require("./seed");

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
  console.log(`[socket] client connected ${socket.id} from ${origin}`);

  socket.on("disconnect", (reason) => {
    console.log(`[socket] client disconnected ${socket.id} (${reason})`);
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
  console.log(`[server] running on http://localhost:${env.port}`);
  console.log(`[server] API base available at http://localhost:${env.port}/api`);
  console.log(`[server] health check available at http://localhost:${env.port}/api/health`);
}

function handleServerError(error) {
  if (error.code === "EADDRINUSE") {
    console.error(`[server] port ${env.port} is already in use. Stop the existing process or change PORT.`);
    process.exit(1);
  }

  console.error("[server] runtime error", error);
}

async function startServer() {
  server.on("error", handleServerError);
  console.log("MONGO_URI Loaded:", process.env.MONGO_URI ? "YES" : "NO");

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
  console.log(`[server] ${signal} received, shutting down gracefully`);

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
    console.error("[server] graceful shutdown failed", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer().catch((error) => {
  console.error("[server] startup failed", error.message);
  process.exit(1);
});
