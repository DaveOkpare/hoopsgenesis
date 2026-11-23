import { useSyncExternalStore } from "react";

/*
 * True below Tailwind's `md` breakpoint (768px), where screens switch to the phone
 * designs. Use it only when the phone and desktop layouts are different components
 * (for example a form laid out twice); for styling, prefer `max-md:` classes.
 * Signed-in routes render on the client, so the first value is already correct there.
 */
const PHONE_QUERY = "(max-width: 767.98px)";

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(PHONE_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(PHONE_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
