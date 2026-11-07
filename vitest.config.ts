import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const INTEGRATION_TESTS = "src/**/*.integration.test.ts";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          // Pure tests: no database, safe for the CI `ci` job.
          name: "unit",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: [INTEGRATION_TESTS],
        },
      },
      {
        extends: true,
        test: {
          // DB-level tests against a running local Supabase (`npx supabase start`).
          name: "integration",
          include: [INTEGRATION_TESTS],
          // Only SUPABASE_* from .env; the suite's own guard refuses non-local URLs.
          env: loadEnv(mode, process.cwd(), "SUPABASE_"),
          testTimeout: 30_000,
          hookTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
  },
}));
