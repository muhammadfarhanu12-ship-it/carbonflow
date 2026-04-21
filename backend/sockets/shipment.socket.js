module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("Client connected for shipments real-time updates");

    socket.on("subscribeShipments", () => {
      console.log("Client subscribed to shipments updates");
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected from shipments updates");
    });
  });
};