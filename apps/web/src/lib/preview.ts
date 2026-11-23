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
