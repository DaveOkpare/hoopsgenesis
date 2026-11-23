/*
 * Fixtures only the owner Users screen needs ("[Owner] Find and support a user").
 * People and memberships come from the shared fixtures; this adds what the admin
 * plugin knows about them (sessions). Only api.ts imports this.
 */
import type { Id, Timestamp } from "@/features/types";

/** People on the platform in the design ("205 people across all academies"). */
export const PLATFORM_USER_TOTAL = 205;

export interface SessionFixture {
  id: Id;
  updatedAt: Timestamp;
  userAgent: string;
  userId: Id;
}

export const sessions: SessionFixture[] = [
  {
    id: "session-aline-phone",
    userId: "user-aline",
    userAgent: "Hoops Genesis iOS",
    updatedAt: "2026-11-23T05:12:00Z",
  },
  {
    id: "session-aline-web",
    userId: "user-aline",
    userAgent: "Chrome on Android",
    updatedAt: "2026-11-20T16:40:00Z",
  },
  {
    id: "session-marie-phone",
    userId: "user-marie",
    userAgent: "Hoops Genesis Android",
    updatedAt: "2026-11-22T14:05:00Z",
  },
  {
    id: "session-sharika-web",
    userId: "user-sharika",
    userAgent: "Safari on macOS",
    updatedAt: "2026-11-23T07:58:00Z",
  },
  {
    id: "session-sharika-phone",
    userId: "user-sharika",
    userAgent: "Hoops Genesis iOS",
    updatedAt: "2026-11-23T06:30:00Z",
  },
  {
    id: "session-patrick-phone",
    userId: "user-patrick",
    userAgent: "Hoops Genesis Android",
    updatedAt: "2026-11-23T05:02:00Z",
  },
  {
    id: "session-jean-phone",
    userId: "user-jean",
    userAgent: "Hoops Genesis Android",
    updatedAt: "2026-11-21T15:20:00Z",
  },
];
