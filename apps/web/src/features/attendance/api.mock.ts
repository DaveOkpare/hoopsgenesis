/*
 * Fixture twin of ./api.ts for dev preview (see lib/preview.ts). Numbers are the
 * designs' (Paper 8EI-0, 7KA-0, 8WB-0, C8S-0): Kigali, "today" Mon 23 Nov 2026.
 */
import type {
  AcademyAttendance,
  AttendanceRanges,
  SessionSummary,
  StatusCounts,
  StudentAttendance,
  TeamAttendance,
} from "@/features/attendance/api";
import { byMostMissed, summariseSessions } from "@/features/attendance/api";
import type { CalendarItem } from "@/features/calendar/api";
import { FIXTURE_ITEMS, FIXTURE_TEAMS } from "@/features/calendar/fixtures";
import { fixtureDelay } from "@/features/fixtures";
import type { AttendanceStatus, Id, Timestamp } from "@/features/types";
import { previewPersonaFor } from "@/lib/preview";

const COACH_TEAM_IDS = new Set(["team-u12", "team-u14", "team-u16"]);

function counts(
  present: number,
  late: number,
  absent: number,
  excused = 0
): StatusCounts {
  return { present, late, absent, excused };
}

/** Per-session counts drawn in the designs, by session key. */
const SESSION_COUNTS: Record<string, StatusCounts> = {
  "event-girls-2026-11-19:2026-11-19": counts(10, 0, 0),
  "event-u16-match-1121:2026-11-21": counts(14, 0, 1),
  "event-u14-2026-11-20:2026-11-20": counts(14, 2, 0),
  "event-u12-2026-11-20:2026-11-20": counts(15, 0, 1),
  "event-u14-2026-11-16:2026-11-16": counts(15, 1, 2),
  "event-u14-2026-11-13:2026-11-13": counts(16, 0, 2),
  "event-u14-2026-11-11:2026-11-11": counts(17, 1, 0),
  "event-u14-2026-11-09:2026-11-09": counts(13, 2, 3),
};

function sessionsFor(items: CalendarItem[], now: Date): SessionSummary[] {
  const teams = new Map(FIXTURE_TEAMS.map((team) => [team.id, team]));
  return summariseSessions(items, [], teams, now).map((session) => {
    if (!session.ended || session.cancelled) {
      return { ...session, neverCheckedIn: session.roster };
    }
    const roster = session.roster ?? 0;
    const drawn = SESSION_COUNTS[session.key];
    const sessionCounts = drawn ?? counts(Math.max(0, roster - 1), 0, 1);
    const recorded =
      sessionCounts.present +
      sessionCounts.late +
      sessionCounts.absent +
      sessionCounts.excused;
    return {
      ...session,
      counts: sessionCounts,
      neverCheckedIn: Math.max(0, roster - recorded),
    };
  });
}

function inRange(item: CalendarItem, range: { from: string; to: string }) {
  return item.sessionDate >= range.from && item.sessionDate <= range.to;
}

function student(
  studentId: Id,
  name: string,
  teamId: Id,
  absent: number,
  counted: number,
  lastSeen: string | null,
  extra: Partial<StudentAttendance> = {}
): StudentAttendance {
  return {
    studentId,
    name,
    teamId,
    absent,
    late: 0,
    counted,
    rate: counted === 0 ? null : (counted - absent) / counted,
    lastSeen,
    statuses: {},
    feesOverdueDays: null,
    ...extra,
  };
}

const FILLER_NAMES = [
  "Aline Uwase",
  "Jean Mugisha",
  "Olivia Uwimana",
  "Mercy Gatete",
  "Keza Nyiraneza",
  "Brian Manzi",
  "Ange Kamikazi",
  "Samuel Mugabo",
  "Fiona Umutoni",
  "Ivan Shema",
  "Eric Habimana",
  "Grace Mukeshimana",
  "Patrick Nkurunziza",
  "Diane Uwera",
  "Moses Twagira",
  "Clarisse Ineza",
  "Yvan Bizimana",
  "Nadine Umuhoza",
  "Joel Niyomugabo",
  "Sandra Iradukunda",
];

const TEAM_SPREAD = ["team-u12", "team-u14", "team-u16", "team-girls-u16"];
const STUDENTS_TOTAL = 64;

function academyStudents(): StudentAttendance[] {
  const drawn = [
    student(
      "user-samuel-i",
      "Samuel Iradukunda",
      "team-u16",
      5,
      12,
      "2026-11-13"
    ),
    student(
      "user-claudine",
      "Claudine Mukamana",
      "team-girls-u16",
      4,
      10,
      "2026-11-17"
    ),
    student("user-kevin", "Kevin Nshuti", "team-u14", 3, 12, "2026-11-20"),
    student(
      "user-divine-i",
      "Divine Ingabire",
      "team-u12",
      3,
      11,
      "2026-11-18"
    ),
    student("user-yves", "Yves Mugenzi", "team-u16", 2, 12, "2026-11-21"),
  ];
  const filler = Array.from(
    { length: STUDENTS_TOTAL - drawn.length },
    (_, index) => {
      const base = FILLER_NAMES[index % FILLER_NAMES.length] ?? "Student";
      const name = base;
      return student(
        `user-filler-${index}`,
        name,
        TEAM_SPREAD[index % TEAM_SPREAD.length] ?? "team-u12",
        index % 3 === 0 ? 1 : 0,
        12,
        "2026-11-20"
      );
    }
  );
  return [...drawn, ...filler].sort(byMostMissed);
}

const TEAM_RATES: Record<string, [number, number]> = {
  "team-u12": [0.92, 0.89],
  "team-u14": [0.9, 0.86],
  "team-u16": [0.84, 0.82],
  "team-girls-u16": [0.79, 0.81],
};

function visibleTeams() {
  const persona = previewPersonaFor(window.location.pathname, {});
  return FIXTURE_TEAMS.filter(
    (team) => persona !== "coach" || COACH_TEAM_IDS.has(team.id)
  );
}

export async function getAcademyAttendance(
  _academyId: Id,
  params: AttendanceRanges & { teamId?: Id; now: Timestamp }
): Promise<AcademyAttendance> {
  await fixtureDelay();
  const now = new Date(params.now);
  const teams = visibleTeams().filter(
    (team) => !params.teamId || team.id === params.teamId
  );
  const items = FIXTURE_ITEMS.filter(
    (item) =>
      inRange(item, params.period) &&
      (!params.teamId || item.teamId === params.teamId)
  );
  return {
    counts: counts(200, 19, 30),
    previousCounts: counts(180, 10, 45),
    missedTwoPlus: 6,
    sessions: sessionsFor(items, now),
    studentCount: params.teamId
      ? teams.reduce((sum, team) => sum + team.studentCount, 0)
      : STUDENTS_TOTAL,
    teams: teams.map((team) => ({
      team,
      periodRate: TEAM_RATES[team.id]?.[0] ?? null,
      monthRate: TEAM_RATES[team.id]?.[1] ?? null,
    })),
    missed: academyStudents().filter(
      (row) => !params.teamId || row.teamId === params.teamId
    ),
  };
}

type Mark = AttendanceStatus | null;

/** U14's week of 16 Nov as C8S-0 draws it: Mon 16, Wed 18 (cancelled), Fri 20. */
const U14_WEEK: [string, string, Mark, Mark][] = [
  ["user-aline", "Aline Uwase", "present", "present"],
  ["user-divine-n", "Divine Niyonsaba", "absent", "absent"],
  ["user-fiona", "Fiona Umutoni", "late", "present"],
  ["user-ivan", "Ivan Shema", "present", "present"],
  ["user-jean", "Jean Mugisha", "present", "late"],
  ["user-kevin", "Kevin Nshuti", "late", "present"],
  ["user-olivier", "Olivier Kamanzi", "absent", "present"],
];

const MON_16 = "event-u14-2026-11-16:2026-11-16";
const FRI_20 = "event-u14-2026-11-20:2026-11-20";

function u14Students(): StudentAttendance[] {
  const drawn = U14_WEEK.map(([id, name, mon, fri]) => {
    const statuses: Record<string, AttendanceStatus> = {};
    if (mon) {
      statuses[MON_16] = mon;
    }
    if (fri) {
      statuses[FRI_20] = fri;
    }
    return student(id, name, "team-u14", 0, 10, "2026-11-20", { statuses });
  });
  const named = new Map(drawn.map((row) => [row.studentId, row]));
  const divine = named.get("user-divine-n");
  if (divine) {
    Object.assign(divine, {
      absent: 4,
      rate: 0.6,
      feesOverdueDays: 23,
      lastSeen: "2026-11-11",
    });
  }
  const olivier = named.get("user-olivier");
  if (olivier) {
    Object.assign(olivier, { absent: 2, rate: 0.8, lastSeen: "2026-11-13" });
  }
  const kevin = named.get("user-kevin");
  if (kevin) {
    Object.assign(kevin, { absent: 1, late: 3, rate: 0.9 });
  }
  const U14_SIZE = 18;
  const filler = Array.from({ length: U14_SIZE - drawn.length }, (_, index) =>
    student(
      `user-u14-${index}`,
      FILLER_NAMES[(index + 7) % FILLER_NAMES.length] ?? "Student",
      "team-u14",
      0,
      10,
      "2026-11-20",
      { statuses: { [MON_16]: "present", [FRI_20]: "present" } }
    )
  );
  return [...drawn, ...filler].sort((a, b) => a.name.localeCompare(b.name));
}

function genericStudents(teamId: Id, size: number): StudentAttendance[] {
  return Array.from({ length: size }, (_, index) =>
    student(
      `user-${teamId}-${index}`,
      FILLER_NAMES[index % FILLER_NAMES.length] ?? "Student",
      teamId,
      index % 4 === 0 ? 1 : 0,
      10,
      "2026-11-20"
    )
  ).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTeamAttendance(
  _academyId: Id,
  teamId: Id,
  params: AttendanceRanges & { now: Timestamp }
): Promise<TeamAttendance> {
  await fixtureDelay();
  const team = FIXTURE_TEAMS.find((row) => row.id === teamId);
  const items = FIXTURE_ITEMS.filter(
    (item) => item.teamId === teamId && inRange(item, params.period)
  );
  return {
    teamId,
    counts: teamId === "team-u14" ? counts(79, 9, 12) : counts(85, 5, 10),
    previousCounts:
      teamId === "team-u14" ? counts(75, 9, 16) : counts(80, 6, 14),
    sessions: sessionsFor(items, new Date(params.now)),
    students:
      teamId === "team-u14"
        ? u14Students()
        : genericStudents(teamId, team?.studentCount ?? 0),
  };
}
