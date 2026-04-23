import type { Socket } from "socket.io-client";

import { SOCKET_URL } from "../config/backend";
import { socket } from "./socket";

function devLog(level: "info" | "error", message: string) {
  if (!import.meta.env.DEV) {
    return;
  }

  if (level === "error") {
    console.error(message);
    return;
  }

  console.info(message);
}

class SocketService {
  private socket: Socket = socket;
  private hasLifecycleLogging = false;

  private ensureLifecycleLogging() {
    if (this.hasLifecycleLogging) {
      return;
    }

    this.hasLifecycleLogging = true;

    devLog("info", `[socket] backend URL: ${SOCKET_URL}`);

    this.socket.on("connect", () => {
      devLog("info", `[socket] connected: ${this.socket.id}`);
    });

    this.socket.on("disconnect", (reason) => {
      devLog("info", `[socket] disconnected: ${reason}`);
    });

    this.socket.on("connect_error", (error) => {
      devLog("error", `[socket] connection failed for ${SOCKET_URL}: ${error.message}`);
    });
  }

  connect() {
    this.ensureLifecycleLogging();

    if (!this.socket.connected) {
      this.socket.connect();
    }

    return this.socket;
  }

  on<T>(event: string, callback: (payload: T) => void) {
    const socket = this.connect();
    socket.on(event, callback);
    return () => {
      socket.off(event, callback);
    };
  }
}

export const socketService = new SocketService();
