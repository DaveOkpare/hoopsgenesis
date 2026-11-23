/*
 * Fixture roster for the coach screens (Today, Team page, Session, Log a result).
 * The shared fixtures only carry the people named in the designs; the designs also say
 * "16 students" on U12, "18 students" on U14 and "15 students" on U16, so the rest of
 * each roster is filled in here. Only api.ts files import this module.
 *
 * The arrays are mutable on purpose: mutations in api.ts (add/move/remove a team member)
 * change them so the fixture-backed queries react like the real API would.
 */
import {
  members as sharedMembers,
  outstandingFees as sharedOutstandingFees,
} from "@/features/fixtures";
import type { DateOnly, Member, OutstandingFee } from "@/features/types";

const ACADEMY = "acad-kigali";
const JOINED = "2026-08-01T08:00:00Z";

function extraStudent(slug: string, name: string, teamId: string): Member {
  const userId = `user-${slug}`;
  return {
    id: `member-${ACADEMY}-${userId}`,
    academyId: ACADEMY,
    userId,
    roles: ["student"],
    user: {
      id: userId,
      name,
      email: `${slug}@example.com`,
      image: null,
    },
    teamIds: [teamId],
    createdAt: JOINED,
  };
}

const extraStudents: [string, string, string][] = [
  // U12: 6 named in the designs + 10.
  ["fabrice-m", "Fabrice Mutabazi", "team-u12"],
  ["yvonne-u", "Yvonne Umutoni", "team-u12"],
  ["claude-h", "Claude Habineza", "team-u12"],
  ["josiane-i", "Josiane Ishimwe", "team-u12"],
  ["david-n", "David Nshimiyimana", "team-u12"],
  ["alice-m", "Alice Mukamana", "team-u12"],
  ["moise-h", "Moise Hakizimana", "team-u12"],
  ["clarisse-u", "Clarisse Uwamahoro", "team-u12"],
  ["ivan-g", "Ivan Gasana", "team-u12"],
  ["nadia-u", "Nadia Umuhoza", "team-u12"],
  // U14: 5 named + 13.
  ["bosco-m", "Bosco Mugenzi", "team-u14"],
  ["teta-i", "Teta Ingabire", "team-u14"],
  ["arsene-n", "Arsene Niyonkuru", "team-u14"],
  ["sandrine-u", "Sandrine Uwimana", "team-u14"],
  ["joel-h", "Joel Habimana", "team-u14"],
  ["fiona-m", "Fiona Mutesi", "team-u14"],
  ["elie-n", "Elie Nsengiyumva", "team-u14"],
  ["chantal-i", "Chantal Ikirezi", "team-u14"],
  ["aimable-b", "Aimable Bizimana", "team-u14"],
  ["gisele-u", "Gisele Uwineza", "team-u14"],
  ["noella-u", "Noella Uwamariya", "team-u14"],
  ["jado-k", "Jado Kayitare", "team-u14"],
  ["pacifique-n", "Pacifique Nizeyimana", "team-u14"],
  // U16: 2 named + 13.
  ["christian-n", "Christian Ndayisaba", "team-u16"],
  ["emmanuel-h", "Emmanuel Hirwa", "team-u16"],
  ["jonathan-m", "Jonathan Mbonyi", "team-u16"],
  ["ruth-i", "Ruth Ingabire", "team-u16"],
  ["patience-m", "Patience Mukeshimana", "team-u16"],
  ["eddy-s", "Eddy Shema", "team-u16"],
  ["yannick-r", "Yannick Rugamba", "team-u16"],
  ["sonia-u", "Sonia Uwizeye", "team-u16"],
  ["hope-a", "Hope Akaliza", "team-u16"],
  ["benjamin-n", "Benjamin Ndahiro", "team-u16"],
  ["victor-r", "Victor Rukundo", "team-u16"],
  ["celine-m", "Celine Mukandayisenga", "team-u16"],
  ["alain-m", "Alain Mutoni", "team-u16"],
  // Girls U16: 1 named + 13 ("14 students" on the Teams list, 72W-0).
  ["belise-u", "Belise Uwera", "team-girls-u16"],
  ["divine-k", "Divine Keza", "team-girls-u16"],
  ["esther-m", "Esther Mukamurenzi", "team-girls-u16"],
  ["florence-i", "Florence Iradukunda", "team-girls-u16"],
  ["gloria-n", "Gloria Nishimwe", "team-girls-u16"],
  ["honorine-u", "Honorine Umutesi", "team-girls-u16"],
  ["irene-k", "Irene Kayitesi", "team-girls-u16"],
  ["joyeuse-m", "Joyeuse Mahoro", "team-girls-u16"],
  ["kellia-i", "Kellia Ineza", "team-girls-u16"],
  ["linda-u", "Linda Uwase", "team-girls-u16"],
  ["melissa-n", "Melissa Nyampinga", "team-girls-u16"],
  ["nadine-i", "Nadine Isimbi", "team-girls-u16"],
  ["olga-m", "Olga Mutoni", "team-girls-u16"],
];

/** Every member of the Kigali academy the coach screens can see (mutable). */
export const academyMembers: Member[] = [
  ...sharedMembers
    .filter((m) => m.academyId === ACADEMY)
    .map((m) => ({ ...m, teamIds: [...m.teamIds] })),
  ...extraStudents.map(([slug, name, teamId]) =>
    extraStudent(slug, name, teamId)
  ),
];

/** Sport per team (not in the schema yet; the team page eyebrow shows it). */
export const teamSport: Record<string, string> = {
  "team-u12": "Basketball",
  "team-u14": "Basketball",
  "team-u16": "Basketball",
  "team-girls-u16": "Football",
};

/** Pronoun used in "Moving takes her off U12" copy. Defaults to "they". */
export const pronouns: Record<string, "she" | "he"> = {
  "user-mercy": "she",
  "user-aline": "she",
  "user-olivia": "she",
  "user-keza": "she",
  "user-ange": "she",
  "user-grace-i": "she",
  "user-divine-i": "she",
  "user-eric": "he",
  "user-jean": "he",
  "user-brian": "he",
  "user-kevin": "he",
  "user-olivier": "he",
  "user-samuel-i": "he",
  "user-samuel-m": "he",
  "user-divine-n": "he",
};

/** Who hasn't paid (GET /fees/outstanding), shared list plus Olivia's ("FEES 18D"). */
export const outstandingFees: OutstandingFee[] = [
  ...sharedOutstandingFees,
  {
    studentId: "user-olivia",
    teamId: "team-u12",
    amount: "30000.00",
    currency: "RWF",
    lastPaidAt: "2026-10-02T09:00:00Z",
    dueDate: "2026-11-05",
  },
];

/** A verified athletic result, as `data` on an athletic student_record. */
export type AthleticResultData =
  | {
      sport: "basketball";
      drill: "free_throws" | "three_point";
      made: number;
      attempts: number;
    }
  | { sport: "basketball"; drill: "dribbling"; seconds: number };

export interface StudentProgressFixture {
  attendancePercent: number;
  lastSessionOn: DateOnly;
  latestResult: AthleticResultData | null;
}

/** Attendance this month and latest verified result, as in "U14 this month". */
const namedProgress: Record<string, StudentProgressFixture> = {
  "user-aline": {
    attendancePercent: 92,
    lastSessionOn: "2026-11-21",
    latestResult: {
      sport: "basketball",
      drill: "free_throws",
      made: 7,
      attempts: 10,
    },
  },
  "user-jean": {
    attendancePercent: 85,
    lastSessionOn: "2026-11-21",
    latestResult: {
      sport: "basketball",
      drill: "free_throws",
      made: 7,
      attempts: 10,
    },
  },
  "user-divine-n": {
    attendancePercent: 55,
    lastSessionOn: "2026-11-10",
    latestResult: { sport: "basketball", drill: "dribbling", seconds: 41 },
  },
  "user-olivier": {
    attendancePercent: 78,
    lastSessionOn: "2026-11-19",
    latestResult: {
      sport: "basketball",
      drill: "three_point",
      made: 4,
      attempts: 10,
    },
  },
};

const LAST_SESSIONS: DateOnly[] = ["2026-11-21", "2026-11-19", "2026-11-17"];
const ATTENDANCE_STEPS = [96, 88, 81, 74, 91, 69, 84, 100];
const MIN_SECONDS = 36;
const SECONDS_SPREAD = 9;
const ATTEMPTS = 10;
const MADE_SPREAD = 6;
const MIN_MADE = 3;
const DRILLS = 3;

/** Progress for anyone not named in the designs: varied but stable per student. */
function generatedProgress(index: number): StudentProgressFixture {
  const drill = index % DRILLS;
  let latestResult: AthleticResultData;
  if (drill === 2) {
    latestResult = {
      sport: "basketball",
      drill: "dribbling",
      seconds: MIN_SECONDS + (index % SECONDS_SPREAD),
    };
  } else {
    latestResult = {
      sport: "basketball",
      drill: drill === 0 ? "free_throws" : "three_point",
      made: MIN_MADE + (index % MADE_SPREAD),
      attempts: ATTEMPTS,
    };
  }
  return {
    attendancePercent: ATTENDANCE_STEPS[index % ATTENDANCE_STEPS.length] ?? 90,
    lastSessionOn: LAST_SESSIONS[index % LAST_SESSIONS.length] ?? "2026-11-21",
    latestResult,
  };
}

export function progressFor(userId: string): StudentProgressFixture {
  const named = namedProgress[userId];
  if (named) {
    return named;
  }
  const index = academyMembers.findIndex((m) => m.userId === userId);
  return generatedProgress(Math.max(0, index));
}

/** Roster order: people named in the designs first, in design order. */
export const rosterOrder: string[] = [
  "user-aline",
  "user-jean",
  "user-divine-n",
  "user-olivier",
  "user-kevin",
];
