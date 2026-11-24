import { useSyncExternalStore } from "react";

/*
 * True below Tailwind's `lg` breakpoint (1024px). The team page uses the phone layout
 * up to there ([Spec] Responsive rules D5O-0: below 1024px tables become two-line rows
 * and side panels open on their own), so "Add student" opens a sheet instead of
 * focusing the side panel. Signed-in routes render on the client only.
 */
const BELOW_LG_QUERY = "(max-width: 1023.98px)";

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(BELOW_LG_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(BELOW_LG_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useBelowLg(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
