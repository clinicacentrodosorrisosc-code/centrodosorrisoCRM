import { defineConfig } from "@playwright/test";

/**
 * O servidor Vite e iniciado separadamente no Windows para que o processo possa
 * ser encerrado pelo PID. O webServer embutido do Playwright deixa o filho do
 * corepack vivo mesmo depois de a spec terminar.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "dashboard.visual.spec.ts",
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4178",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
