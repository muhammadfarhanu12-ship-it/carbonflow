const DashboardService = require("../services/dashboard.service");

module.exports = (io) => {

  io.on("connection", (socket) => {

    socket.on("subscribeDashboard", async (companyId) => {
      const data = await DashboardService.getMetrics(companyId);
      socket.emit("dashboardUpdate", data);
    });

  });
};
