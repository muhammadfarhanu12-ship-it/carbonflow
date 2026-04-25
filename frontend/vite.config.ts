import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const proxyTarget = env.VITE_SOCKET_URL
    ? env.VITE_SOCKET_URL.replace(/\/+$/, "")
    : env.VITE_API_BASE_URL
    ? env.VITE_API_BASE_URL.replace(/\/api\/?$/, "")
    : "https://carbonflow-h9cj.onrender.com";

  return {
    plugins: [react(), tailwindcss()],
    define: {
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== "true",
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/socket.io": {
          target: proxyTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});
