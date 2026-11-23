/*
 * The "now" that session screens are drawn at.
 * Real use: the current time. Preview mode (dev only): the designs' morning,
 * Mon 23 Nov 2026 07:24 in Kigali (the time on "Check in now · 07:24"), and any
 * `?at=HH:mm` on a coach URL moves the clock, e.g. `?at=10:02` shows the close-out state.
 */
import { useSearch } from "@tanstack/react-router";

import { appNow, isUiPreview } from "@/lib/preview";

import { zonedInstant } from "./time";

const PREVIEW_DATE = "2026-11-23";
const PREVIEW_TIME = "07:24";
const PREVIEW_ZONE = "Africa/Kigali";
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validate an `at` search param; anything else is dropped. */
export function parseAtParam(value: unknown): string | undefined {
  return typeof value === "string" && HH_MM.test(value) ? value : undefined;
}

export function sessionClock(at?: string): Date {
  if (!isUiPreview) {
    return appNow();
  }
  return zonedInstant(PREVIEW_DATE, at ?? PREVIEW_TIME, PREVIEW_ZONE);
}

/** The clock for the current coach URL (reads `?at=` in preview mode). */
export function useSessionClock(): Date {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  return sessionClock(parseAtParam(search.at));
}
