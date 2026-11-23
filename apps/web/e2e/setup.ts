// Loads apps/web/.env (DATABASE_URL) for seeding, then refuses to run
// against anything but a local database or a non-responding server.
import "varlock/auto-load";

import { BASE_URL } from "./helpers/env";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set; is apps/web/.env present?");
}
const { hostname } = new URL(databaseUrl);
if (!LOCAL_HOSTS.has(hostname)) {
  throw new Error(`The e2e suite seeds only a local database, not ${hostname}`);
}

try {
  await fetch(`${BASE_URL}/api/v1/me/fees`);
} catch (error) {
  throw new Error(
    `No server at ${BASE_URL}. Start one: cd apps/web && pnpm exec vite dev --port 3090 --strictPort`,
    { cause: error }
  );
}
