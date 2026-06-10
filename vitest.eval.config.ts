import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/eval-setup.ts"],
    exclude: ["**/node_modules/**", "**/tests/qa/**"],
    testTimeout: 30000,
    // Run tests sequentially to avoid OpenAI rate limits
    pool: "forks",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
