/**
 * Settings for the e2e suite, all from the environment:
 *
 * - E2E_BASE_URL        server under test (default http://localhost:3090)
 * - E2E_AUTH_ORIGIN     Origin header for /api/auth/* (default
 *                       http://localhost:3001, the configured BETTER_AUTH_URL)
 * - E2E_WEBHOOK_SECRET  the PAYMENT_WEBHOOK_GENERIC_SECRET the server was
 *                       started with; webhook tests are skipped without it
 * - DATABASE_URL        from apps/web/.env, for seeding (local only)
 */
export const BASE_URL = (
  process.env.E2E_BASE_URL ?? "http://localhost:3090"
).replace(/\/$/, "");

export const AUTH_ORIGIN =
  process.env.E2E_AUTH_ORIGIN ?? "http://localhost:3001";

export const WEBHOOK_SECRET = process.env.E2E_WEBHOOK_SECRET ?? "";

export const HAS_WEBHOOK_SECRET = WEBHOOK_SECRET.length > 0;
