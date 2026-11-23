/*
 * UI preview mode (dev only): the /_auth guard skips the session check and seeds a
 * fixture viewer, so screens can be built without a database or a sign-in.
 *
 * Turn on: VITE_UI_PREVIEW=true in apps/web/.env, then run the dev server.
 * Pick who you are by URL: /admin/* = Sharika (academy admin), /coach/* = Sharika
 * (coach only), /student/* = Aline (student), /owner/* = Innocent (platform owner).
 * /app?as=coach (or admin|owner|student) redirects to that persona's home.
 * Add ?impersonating=1 on an /admin URL to show the owner's "Viewing as" banner.
 *
 * `import.meta.env.DEV` is replaced with `false` in production builds, so this whole
 * branch is removed there no matter what the variable says.
 *
 * Fixtures are never in a production bundle. Each feature keeps its fixture
 * implementation in a sibling `api.mock.ts` (with its in-memory stores) and its real
 * implementation in `api.ts`, which delegates to the mock only in dev preview:
 *
 *   const mock =
 *     import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;
 *
 *   export async function listFees(academyId: Id, params: FeeParams) {
 *     if (mock) {
 *       return (await mock()).listFees(academyId, params);
 *     }
 *     return apiAll<Fee>(academyPath(academyId, "/fees"), { query: params });
 *   }
 *
 * Keep the literal `import.meta.env.DEV &&` in that ternary: the bundler folds it to
 * `false` and drops the dynamic import (and with it every fixture module).
 */
import { ENV } from "@/env";
import type { ViewerPersona } from "@/features/viewer/api";

export const isUiPreview: boolean =
  import.meta.env.DEV && ENV.VITE_UI_PREVIEW === true;

const PERSONAS: readonly ViewerPersona[] = [
  "admin",
  "owner",
  "coach",
  "student",
];

function isPersona(value: unknown): value is ViewerPersona {
  return PERSONAS.includes(value as ViewerPersona);
}

/** The moment every design is drawn at: Mon 23 Nov 2026, 10:02 in Kigali. */
export const PREVIEW_NOW = new Date("2026-11-23T08:02:00Z");

const PAGE_LOADED_AT = Date.now();

/**
 * "Now" for the app. Real mode: the clock. Preview: the designs' moment plus the time
 * since the page loaded, so new rows sort after the fixtures and read as "Today".
 */
export function appNow(): Date {
  if (import.meta.env.DEV && isUiPreview) {
    return new Date(PREVIEW_NOW.getTime() + (Date.now() - PAGE_LOADED_AT));
  }
  return new Date();
}

export function previewPersonaFor(
  pathname: string,
  search: Record<string, unknown>
): ViewerPersona {
  const [, section] = pathname.split("/");
  if (isPersona(section)) {
    return section;
  }
  return isPersona(search.as) ? search.as : "admin";
}

export function previewImpersonating(search: Record<string, unknown>): boolean {
  const value = search.impersonating;
  return value === 1 || value === "1" || value === true || value === "true";
}
