// vitest.config.ts — Node environment so server libs (sqlite, cheerio) run natively.
import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
