const logger = require("../utils/logger");

module.exports = (io) => {
  io.on("connection", (socket) => {
    logger.debug("socket.shipments.connected", { socketId: socket.id });

    socket.on("subscribeShipments", () => {
      logger.debug("socket.shipments.subscribed", { socketId: socket.id });
    });

    socket.on("disconnect", () => {
      logger.debug("socket.shipments.disconnected", { socketId: socket.id });
    });
  });
};
