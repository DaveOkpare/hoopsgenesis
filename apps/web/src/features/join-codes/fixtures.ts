/*
 * Join code fixtures (Paper page "Join with a code": 6G1-0 list, 6RV-0 created code,
 * 6WQ-0 to 6WU-0 joining). Only features/join-codes/api.ts imports this file.
 *
 * Codes and the state each one produces when entered at /join:
 *   K7PM-4QXR-9TWC  Kigali, students on U14, 4 of 20 used, ends Fri 27 Nov  -> confirm
 *   HX3N-WR8T-2KMV  Kigali, one coach, no team, ends Mon 30 Nov            -> confirm
 *   P9DQ-6TZA-HE4B  Kigali, students, no team, no limit, until 31 Jan       -> confirm ("No team yet")
 *   R4KV-7MXE-2HQT  Kigali, students on U14, up to 20, until Mon 30 Nov     -> confirm (the code
 *                   "created" in 6RV-0; it exists once an admin creates a code or someone enters it)
 *   M2VG-7KRC-3YHN  Kigali, Girls U16, 14 of 14 used                         -> used up (6WU-0)
 *   B6TW-QP3M-8XEA  Kigali, U12, revoked                                     -> turned off
 *   T3QW-8NFD-5KJE  Kampala, stopped working on 18 Nov                       -> expired
 *   anything else                                                           -> not found
 */
import type { Id, Timestamp } from "@/features/types";

export interface CodeSeed {
  academyId: Id;
  code: string;
  createdAt: Timestamp;
  createdById: Id;
  expiresAt: Timestamp | null;
  id: Id;
  maxUses: number | null;
  /** Newest first here; api.ts returns them oldest first, as the server does. Names only:
   * these people are not in the shared member fixtures. */
  redemptions: { name: string; redeemedAt: Timestamp }[];
  revoke: { at: Timestamp; byId: Id; reason: string | null } | null;
  role: "coach" | "student";
  teamId: Id | null;
  useCount: number;
}

const FIRST_NAMES = [
  "Aimable",
  "Belyse",
  "Cedric",
  "Diane",
  "Emmanuel",
  "Fiona",
  "Gad",
  "Hope",
  "Ines",
  "Joel",
  "Kevine",
  "Lionel",
  "Moise",
  "Nadia",
  "Patience",
  "Rita",
];
const LAST_NAMES = [
  "Habimana",
  "Uwimana",
  "Mugisha",
  "Iradukunda",
  "Niyonsaba",
  "Ishimwe",
  "Nshuti",
  "Kamanzi",
  "Mutoni",
];
const HOUR_MS = 3_600_000;

/** `count` made-up joiners, one every `everyHours`, newest at `newest`. */
function joiners(
  count: number,
  newest: Timestamp,
  everyHours: number,
  offset = 0
): CodeSeed["redemptions"] {
  const start = Date.parse(newest);
  return Array.from({ length: count }, (_, index) => {
    const n = index + offset;
    const first = FIRST_NAMES[n % FIRST_NAMES.length];
    const last = LAST_NAMES[(n * 5 + 3) % LAST_NAMES.length];
    return {
      name: `${first} ${last}`,
      redeemedAt: new Date(start - index * everyHours * HOUR_MS).toISOString(),
    };
  });
}

export const codeSeeds: CodeSeed[] = [
  {
    id: "code-k7pm",
    academyId: "acad-kigali",
    code: "K7PM-4QXR-9TWC",
    role: "student",
    teamId: "team-u14",
    maxUses: 20,
    useCount: 4,
    expiresAt: "2026-11-27T21:59:00Z",
    createdById: "user-sharika",
    createdAt: "2026-11-20T07:30:00Z",
    revoke: null,
    redemptions: [
      { name: "Claire Ingabire", redeemedAt: "2026-11-23T07:12:00Z" },
      { name: "Yves Ntwari", redeemedAt: "2026-11-22T14:40:00Z" },
      { name: "Fabrice Nkurunziza", redeemedAt: "2026-11-21T09:05:00Z" },
      { name: "Gloria Umutoni", redeemedAt: "2026-11-20T16:20:00Z" },
    ],
  },
  {
    id: "code-hx3n",
    academyId: "acad-kigali",
    code: "HX3N-WR8T-2KMV",
    role: "coach",
    teamId: null,
    maxUses: 1,
    useCount: 0,
    expiresAt: "2026-11-30T21:59:00Z",
    createdById: "user-sharika",
    createdAt: "2026-11-23T07:40:00Z",
    revoke: null,
    redemptions: [],
  },
  {
    id: "code-p9dq",
    academyId: "acad-kigali",
    code: "P9DQ-6TZA-HE4B",
    role: "student",
    teamId: null,
    maxUses: null,
    useCount: 31,
    expiresAt: "2027-01-31T21:59:00Z",
    createdById: "user-innocent",
    createdAt: "2026-11-02T07:00:00Z",
    revoke: null,
    redemptions: [
      { name: "Eric Niyonzima", redeemedAt: "2026-11-22T08:00:00Z" },
      { name: "Grace Ishimwe", redeemedAt: "2026-11-21T15:30:00Z" },
      ...joiners(29, "2026-11-02T13:00:00Z", 1),
    ],
  },
  {
    id: "code-m2vg",
    academyId: "acad-kigali",
    code: "M2VG-7KRC-3YHN",
    role: "student",
    teamId: "team-girls-u16",
    maxUses: 14,
    useCount: 14,
    expiresAt: "2026-09-30T21:59:00Z",
    createdById: "user-sharika",
    createdAt: "2026-09-01T08:00:00Z",
    revoke: null,
    redemptions: joiners(14, "2026-09-12T16:00:00Z", 18, 3),
  },
  {
    id: "code-b6tw",
    academyId: "acad-kigali",
    code: "B6TW-QP3M-8XEA",
    role: "student",
    teamId: "team-u12",
    maxUses: 20,
    useCount: 3,
    expiresAt: "2026-12-10T21:59:00Z",
    createdById: "user-sharika",
    createdAt: "2026-08-14T08:00:00Z",
    revoke: {
      at: "2026-08-15T09:00:00Z",
      byId: "user-sharika",
      reason: "posted in a public group",
    },
    redemptions: joiners(3, "2026-08-15T08:20:00Z", 4, 7),
  },
  {
    id: "code-t3qw",
    academyId: "acad-kampala",
    code: "T3QW-8NFD-5KJE",
    role: "student",
    teamId: null,
    maxUses: 30,
    useCount: 9,
    expiresAt: "2026-11-18T20:59:00Z",
    createdById: "user-grace-a",
    createdAt: "2026-11-11T07:00:00Z",
    revoke: null,
    redemptions: joiners(9, "2026-11-17T12:00:00Z", 6, 11),
  },
];

/** The code the "Code ready" artboards show (6RV-0, 6WV-0). The first code created is this one. */
export const designedNewCode = {
  id: "code-r4kv",
  code: "R4KV-7MXE-2HQT",
  academyId: "acad-kigali",
  role: "student",
  teamId: "team-u14",
  maxUses: 20,
  days: 7,
  createdById: "user-sharika",
} as const;

/** Who is signed in on /join in preview mode (`?as=` picks another). */
export const joinerFixtures = {
  /** "Signed in as Claire I." (6WQ-0): not in any academy yet. */
  claire: {
    id: "user-claire",
    name: "Claire Ingabire",
    email: "claire.i@example.com",
  },
  /** `?as=student`: Aline, already a student in Kigali ("already a member"). */
  student: {
    id: "user-aline",
    name: "Aline Uwase",
    email: "aline.u@example.com",
  },
} as const;

/** Wrong codes in a row before code entry pauses (spec: "too many wrong guesses"). */
export const WRONG_GUESS_LIMIT = 5;

/** Checking this code answers 429 "too many tries" (9KQ-0 shows R4KV-7MXE-2HQZ). */
export const RATE_LIMITED_CODE = "R4KV7MXE2HQZ";
/** The wait that 429 names in preview ("Try again in 10 minutes"). */
export const RATE_LIMITED_FOR_SECONDS = 600;
