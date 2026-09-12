import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { host: "0.0.0.0", allowedHosts: true, fs: { allow: ["../.."] } },
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    environment: "jsdom",
    setupFiles: ["../../tests/setup.ts"],
    include: ["../../tests/**/*.test.tsx", "../../tests/**/*.test.ts"],
  },
});
