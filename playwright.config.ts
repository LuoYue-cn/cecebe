import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 120000,
  use: {
    baseURL: process.env.E2E_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    headless: true,
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
