import { readdirSync } from "node:fs";
import { defineConfig } from "vite";

export default defineConfig({
  appType: "mpa",
  build: { rolldownOptions: { input: readdirSync(import.meta.dirname).filter((nome) => nome.endsWith(".html")) } },
});
