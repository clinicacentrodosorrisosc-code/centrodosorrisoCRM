import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: path.resolve(process.cwd(), "tests/visual-calendar"),
  resolve: { alias: { "@": path.resolve(process.cwd()) } },
  server: { host: "127.0.0.1" },
});
