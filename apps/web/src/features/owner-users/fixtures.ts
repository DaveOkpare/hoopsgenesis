/*
 * Fixtures only the owner Users screens need ("[Owner] Find and support a user"
 * 36U-0, "[Owner · Web] Member detail, person" EQE-0, phone E62-0 / E73-0).
 * People and memberships come from the shared fixtures; this adds what the admin
 * plugin knows about them (sessions), the person page's memberships for Sharika as
 * drawn, and filler people behind "272 people". Only api.mock.ts imports this.
 */
import type {
  PlatformUser,
  PlatformUserMembership,
} from "@/features/owner-users/api";
import type { Id, Timestamp } from "@/features/types";

/** People on the platform in the designs ("272 people across all academies"). */
export const PLATFORM_USER_TOTAL = 272;

export interface SessionFixture {
  createdAt: Timestamp;
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
    createdAt: "2026-11-23T05:12:00Z",
    updatedAt: "2026-11-23T05:12:00Z",
  },
  {
    id: "session-aline-web",
    userId: "user-aline",
    userAgent: "Chrome on Android",
    createdAt: "2026-11-20T16:40:00Z",
    updatedAt: "2026-11-20T16:40:00Z",
  },
  {
    id: "session-marie-phone",
    userId: "user-marie",
    userAgent: "Hoops Genesis Android",
    createdAt: "2026-11-22T14:05:00Z",
    updatedAt: "2026-11-22T14:05:00Z",
  },
  {
    id: "session-sharika-phone",
    userId: "user-sharika",
    userAgent: "Hoops Genesis iOS",
    createdAt: "2026-11-23T05:55:00Z",
    updatedAt: "2026-11-23T06:02:00Z",
  },
  {
    id: "session-sharika-web",
    userId: "user-sharika",
    userAgent: "Safari on macOS",
    createdAt: "2026-11-19T07:30:00Z",
    updatedAt: "2026-11-23T05:58:00Z",
  },
  {
    id: "session-patrick-phone",
    userId: "user-patrick",
    userAgent: "Hoops Genesis Android",
    createdAt: "2026-11-23T05:02:00Z",
    updatedAt: "2026-11-23T05:02:00Z",
  },
  {
    id: "session-jean-phone",
    userId: "user-jean",
    userAgent: "Hoops Genesis Android",
    createdAt: "2026-11-21T15:20:00Z",
    updatedAt: "2026-11-21T15:20:00Z",
  },
];

/** Sharika's academies as EQE-0 draws them (admin and coach in Kigali, coach in Bengaluru). */
export const membershipOverrides: Partial<
  Record<Id, PlatformUserMembership[]>
> = {
  "user-sharika": [
    {
      academyId: "acad-kigali",
      academyName: "Hoops Genesis Kigali",
      academyShortName: "Kigali",
      joinedAt: "2026-03-03T08:00:00Z",
      roles: ["admin", "coach"],
      teamNames: ["U12", "U14", "U16"],
      timezone: "Africa/Kigali",
    },
    {
      academyId: "acad-bengaluru",
      academyName: "Hoops Genesis Bengaluru",
      academyShortName: "Bengaluru",
      joinedAt: "2026-10-14T08:00:00Z",
      roles: ["coach"],
      teamNames: ["Visiting camp"],
      timezone: "Asia/Kolkata",
    },
  ],
};

const FIRST = [
  "Alice",
  "Bosco",
  "Chantal",
  "David",
  "Esther",
  "Fabrice",
  "Gloria",
  "Hassan",
  "Ines",
  "Joel",
];
const LAST = ["Mukama", "Habineza", "Uwera", "Nkusi", "Mutoni", "Kalisa"];
const TEAMS = ["U12", "U14", "U16"];

/** Students behind the platform total, so paging has something to page through. */
export function fillerPeople(count: number): PlatformUser[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const first = FIRST[index % FIRST.length] ?? "Student";
    const last = LAST[Math.floor(index / FIRST.length) % LAST.length] ?? "";
    const name = `${first} ${last}`;
    return {
      id: `user-filler-${index + 1}`,
      name,
      email: `${first.toLowerCase()}.${index + 1}@example.com`,
      image: null,
      banned: false,
      banReason: null,
      createdAt: "2026-08-01T08:00:00Z",
      dateOfBirth: null,
      phone: null,
      platformRole: "user",
      memberships: [
        {
          academyId: "acad-kigali",
          academyName: "Hoops Genesis Kigali",
          academyShortName: "Kigali",
          joinedAt: "2026-08-01T08:00:00Z",
          roles: ["student"],
          teamNames: [TEAMS[index % TEAMS.length] ?? "U12"],
          timezone: "Africa/Kigali",
        },
      ],
    };
  });
}
