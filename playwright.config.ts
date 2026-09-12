import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: {
    command:
      "python3 -m http.server 4173 --bind 127.0.0.1 --directory apps/web/dist",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    { name: "compact", use: { viewport: { width: 375, height: 812 } } },
    { name: "medium", use: { viewport: { width: 768, height: 1024 } } },
    { name: "wide", use: { viewport: { width: 1440, height: 1000 } } },
  ],
});
