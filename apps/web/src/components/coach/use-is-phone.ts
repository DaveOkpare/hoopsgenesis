import { useSyncExternalStore } from "react";

/** Matches Tailwind's `max-md` (below 768px). */
const PHONE_QUERY = "(max-width: 767.98px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(PHONE_QUERY).matches;
const getServerSnapshot = () => false;

/** True below md, for UI that differs in behaviour (not just layout) on phones. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
