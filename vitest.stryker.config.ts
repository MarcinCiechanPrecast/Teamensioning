import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests only, for Stryker. The vitest runner has no "project" option, and
// with `related` it would otherwise pull in the integration suite (it imports
// src/lib helpers), which needs a running Supabase and can't see mutants anyway.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts"],
  },
});
