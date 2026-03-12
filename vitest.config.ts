import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "brotli-wasm": path.resolve(__dirname, "node_modules/brotli-wasm/index.node.js"),
    },
  },
});
