const logger = require("../utils/logger");

module.exports = (io) => {
  io.on("connection", (socket) => {
    logger.debug("socket.suppliers.connected", { socketId: socket.id });

    socket.on("subscribeSuppliers", () => {
      logger.debug("socket.suppliers.subscribed", { socketId: socket.id });
    });

    socket.on("disconnect", () => {
      logger.debug("socket.suppliers.disconnected", { socketId: socket.id });
    });
  });
};
