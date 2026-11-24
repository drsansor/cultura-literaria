import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/preparar.js",
  retries: 0,
  forbidOnly: true,
  reporter: "list",
  use: { baseURL: "http://localhost:4173", channel: "chrome", locale: "pt-BR" },
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false,
  },
});
