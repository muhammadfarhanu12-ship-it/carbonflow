const LedgerService = require("../services/ledger.service");

module.exports = (io) => {

  io.on("connection", (socket) => {

    socket.on("subscribeLedger", async (companyId) => {

      const interval = setInterval(async () => {
        const data = await LedgerService.list({}, companyId);
        socket.emit("ledgerUpdate", data);
      }, 5000);

      socket.on("disconnect", () => clearInterval(interval));
    });

  });

};
