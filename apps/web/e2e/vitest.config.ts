import { defineConfig } from "vitest/config";

// The black-box suite: real HTTP against a running dev server. Kept apart
// from ../vitest.config.ts so `pnpm run test` (the in-process suite) never
// picks these files up. Run with `pnpm run test:e2e` (see ./README section in
// helpers/env.ts for the variables).
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    root: import.meta.dirname,
    environment: "node",
    include: ["**/*.e2e.test.ts"],
    setupFiles: ["./setup.ts"],
    // Every file builds its own academies, but they share one server and one
    // database; running files one at a time keeps timings readable.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
