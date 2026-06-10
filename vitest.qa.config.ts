import { defineConfig } from "vitest/config";
import path from "path";

// Dedicated config for the opt-in grant-flow QA harness so it never runs in `npm test`.
// Long timeout: it drives ~9 real grants through OpenAI + the live DB end-to-end.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/eval-setup.ts"], // loads .env.local into process.env
    include: ["tests/qa/**/*.spec.ts"],
    testTimeout: 1_200_000,
    hookTimeout: 120_000,
    pool: "forks",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
