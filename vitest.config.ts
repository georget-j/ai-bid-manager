import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/eval-setup.ts"], // loads .env.local into process.env
    exclude: ["**/node_modules/**", "**/evaluation.test.ts", "**/tests/qa/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
