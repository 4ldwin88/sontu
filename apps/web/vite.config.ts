import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [react()],
  build: { outDir: "../../dist", emptyOutDir: true },
  base: "./",
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    fs: { allow: ["../.."] },
  },
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    environment: "jsdom",
    setupFiles: ["../../tests/setup.ts"],
    include: ["../../tests/**/*.test.tsx", "../../tests/**/*.test.ts"],
  },
});
