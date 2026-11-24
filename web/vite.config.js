import { defineConfig } from "vite";

export default defineConfig({
  appType: "mpa",
  build: { rolldownOptions: { input: ["index.html", "menu.html"] } },
});
