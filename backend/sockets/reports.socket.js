const ReportsService = require("../services/reports.service");

module.exports = (io) => {

  io.on("connection", (socket) => {

    socket.on("subscribeReports", async () => {

      const interval = setInterval(async () => {

        const emissions = await ReportsService.getPlatformEmissions();
        const financial = await ReportsService.getFinancialSummary();

        socket.emit("reportsUpdate", {
          emissions,
          financial,
        });

      }, 10000);

      socket.on("disconnect", () => clearInterval(interval));
    });

  });

};