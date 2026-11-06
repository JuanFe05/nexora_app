import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const proxy = {
  "/api": {
    target: process.env.VITE_DEV_PROXY_TARGET ?? "http://localhost:45335",
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), babel({ presets: [reactCompilerPreset()] })],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy,
    // Los volumenes de Docker en Windows/macOS no emiten eventos de archivo: se activa con VITE_USE_POLLING.
    watch: process.env.VITE_USE_POLLING === "true" ? { usePolling: true, interval: 300 } : undefined,
  },
  preview: { host: "0.0.0.0", proxy },
});
