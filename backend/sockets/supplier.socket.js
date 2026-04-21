module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("Client connected to supplier updates");

    socket.on("subscribeSuppliers", () => {
      console.log("Client subscribed to supplier updates");
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected from supplier updates");
    });
  });
};