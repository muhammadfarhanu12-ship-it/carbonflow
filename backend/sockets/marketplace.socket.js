const MarketplaceService = require("../services/marketplace.service");

module.exports = (io) => {

  io.on("connection", (socket) => {

    socket.on("subscribeMarketplace", async (companyId) => {

      const interval = setInterval(async () => {
        const data = await MarketplaceService.list({}, companyId);
        socket.emit("marketplaceUpdate", data);
      }, 5000);

      socket.on("disconnect", () => clearInterval(interval));
    });

  });

};
