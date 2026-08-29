import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visual-calendar",
  testMatch: "*.visual.spec.ts",
  timeout: 15_000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4178", locale: "pt-BR", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } }],
});