/**
 * Allowed `calendar_event.event_type` values. The column is free text; this
 * list is the one place that decides what the API accepts. Adding a type here
 * needs no migration. Removing one keeps old events readable (reads never
 * check the list), but they can no longer be created or switched to it.
 */
export const EVENT_TYPES = [
  "training",
  "match",
  "tournament",
  "camp",
  "trial",
  "meeting",
  "social",
  "other",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
