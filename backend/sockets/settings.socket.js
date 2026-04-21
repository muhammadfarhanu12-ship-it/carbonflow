const SettingsService = require("../services/settings.service");

module.exports = (io) => {

  io.on("connection", (socket) => {

    socket.on("subscribeSettings", async () => {

      const interval = setInterval(async () => {
        const settings = await SettingsService.getSettings();
        socket.emit("settingsUpdate", settings);
      }, 5000);

      socket.on("disconnect", () => clearInterval(interval));
    });

  });

};