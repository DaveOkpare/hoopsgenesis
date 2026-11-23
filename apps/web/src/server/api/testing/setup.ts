// Resolves apps/web/.env (and .env.test, if present) into process.env and
// varlock's ENV before any test imports ../../services.
import "varlock/auto-load";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

// Integration tests write real rows (and audit rows that can never be
// deleted): refuse to run against anything but a local database.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set; is apps/web/.env present?");
}
const { hostname } = new URL(databaseUrl);
if (!LOCAL_HOSTS.has(hostname)) {
  throw new Error(`Tests run only against a local database, not ${hostname}`);
}
