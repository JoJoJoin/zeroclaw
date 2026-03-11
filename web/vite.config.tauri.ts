/**
 * Tauri-specific Vite dev-server configuration.
 *
 * This file is copied into `zeroclaw/web/` at dev-time so that the Vite
 * proxy forwards `/pair`, `/health` and other gateway routes to the
 * locally-running ZeroClaw Gateway (default port 42617) instead of the
 * standalone dev port (5555) used by the upstream project.
 *
 * NOTE: This config is intentionally self-contained (it does NOT import
 * from ./vite.config) to avoid esbuild resolution failures on Windows.
 * Keep the base settings (plugins, aliases, etc.) in sync with the
 * upstream zeroclaw/web/vite.config.ts when updating.
 *
 * Set ZEROCLAW_GATEWAY_PORT to override the default gateway port (42617).
 *
 * Usage (handled automatically by `beforeDevCommand` in tauri.conf.json):
 *   cd zeroclaw/web && npx vite --config vite.config.tauri.ts
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const GATEWAY_PORT = process.env.ZEROCLAW_GATEWAY_PORT ?? "42617";
const GATEWAY_TARGET = `http://127.0.0.1:${GATEWAY_PORT}`;
const GATEWAY_WS_TARGET = `ws://127.0.0.1:${GATEWAY_PORT}`;

export default defineConfig({
  base: "/_app/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
  },
  server: {
    proxy: {
      "/health": { target: GATEWAY_TARGET, changeOrigin: true },
      "/metrics": { target: GATEWAY_TARGET, changeOrigin: true },
      "/webhook": { target: GATEWAY_TARGET, changeOrigin: true },
      "/api": { target: GATEWAY_TARGET, changeOrigin: true },
      "/ws": { target: GATEWAY_WS_TARGET, ws: true },
    },
  },
});
