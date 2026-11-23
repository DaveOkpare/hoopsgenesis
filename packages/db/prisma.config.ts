import path from "node:path";

import { defineConfig, env } from "prisma/config";
import "varlock/auto-load";

export default defineConfig({
  schema: path.join("prisma", "schema"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    // The Prisma CLI (migrations, studio) uses this URL; the app connects
    // through its own driver adapter. Prefer the direct connection when set.
    url: process.env.DATABASE_DIRECT_URL || env("DATABASE_URL"),
  },
});
