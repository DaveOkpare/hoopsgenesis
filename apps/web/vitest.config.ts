import { defineConfig } from "vitest/config";

// Separate from vite.config.ts: tests need none of the app plugins (TanStack
// Start, Nitro, Tailwind), only path aliases and the env.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Loads apps/web/.env through varlock, like the app does.
    setupFiles: ["./src/server/api/testing/setup.ts"],
    // Integration tests share one scratch database.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
