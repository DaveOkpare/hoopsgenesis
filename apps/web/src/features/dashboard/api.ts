/*
 * The admin dashboard (story AO-7). Real implementation: `GET /dashboard` for the head
 * counts, plus the lists each tile needs (attendance, outstanding fees, the review queue,
 * today's events, invitations), combined here. Preview mode delegates to ./api.mock.ts.
 */
import { fetchInvitations, fetchTeams } from "@/features/members/directory";
import type {
  DateOnly,
  Id,
  Money,
  TimeOfDay,
  Timestamp,
} from "@/features/types";
import { academyPath, apiAll, apiData, apiPage } from "@/lib/api-client";
import { appNow, isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

/** "Now" for the dashboard: the designs' moment in preview, the clock otherwise. */
export function referenceNow(): Date {
  return appNow();
}

export interface DashboardSummary {
  attendance: {
    changePts: number;
    thisWeekPercent: number;
    /** Oldest first; the last entry is this week. 0 for a week with no attendance. */
    weekly: { weekStart: DateOnly; percent: number }[];
  };
  expiredInvites: { coaches: number; students: number };
  outstanding: {
    periodStart: DateOnly;
    studentCount: number;
    topTeam: { count: number; name: string } | null;
    /**
     * Sum of what the unpaid students owe: their billed fee when there is one, else
     * their last payment's amount (fees are monthly). Students who never paid add 0.
     */
    total: Money;
  };
  records: {
    oldest: { createdAt: Timestamp; label: string; studentName: string } | null;
    pendingCount: number;
  };
  unclosedSession: {
    missingCheckIns: number;
    sessionDate: DateOnly;
    teamName: string | null;
    title: string;
  } | null;
}

export interface TodaySession {
  checkedIn: number | null;
  collectAttendance: boolean;
  endTime: TimeOfDay | null;
  eventId: Id;
  live: boolean;
  location: string | null;
  rosterSize: number | null;
  startTime: TimeOfDay | null;
  teamName: string | null;
  title: string;
}

export interface UnpaidStudent {
  /** What they owe (billed fee, else their last payment); null when never paid. */
  amount: Money | null;
  /** When it fell due; null when unknown (never paid). */
  dueDate: DateOnly | null;
  /** When the student joined the academy (shown when they never paid). */
  joinedAt: Timestamp | null;
  lastPaidAt: Timestamp | null;
  studentId: Id;
  studentName: string;
  teamId: Id | null;
  teamName: string | null;
}

export interface UnpaidPage {
  data: UnpaidStudent[];
  /** Everyone unpaid, not just the rows returned. */
  total: number;
}

// ---------------------------------------------------------------- server shapes

interface DashboardResponse {
  attendanceThisWeek: {
    absent: number;
    from: DateOnly;
    late: number;
    present: number;
    rate: number | null;
    to: DateOnly;
  };
  fees: { outstandingStudents: number; overdue: number };
  members: { byRole: Record<string, number>; total: number };
  recordsAwaitingReview: number;
  sessionsToday: { date: DateOnly; takingAttendance: number; total: number };
  timezone: string;
  today: DateOnly;
}

interface OutstandingRow {
  currentFee: { amount: string; currency: string; dueDate: DateOnly } | null;
  lastPayment: { amount: string; currency: string; paidAt: Timestamp } | null;
  overdueSince: DateOnly | null;
  student: { id: Id; name: string };
  teams: { id: Id; name: string }[];
}

interface AttendanceRow {
  eventId: Id;
  sessionDate: DateOnly;
  status: "present" | "absent" | "late" | "excused";
  studentId: Id;
  voidedAt: Timestamp | null;
}

interface EventSessionRow {
  cancelled: boolean;
  collectAttendance: boolean;
  endsAt: Timestamp | null;
  endTime: TimeOfDay | null;
  id: Id;
  location: string | null;
  sessionDate: DateOnly;
  startsAt: Timestamp | null;
  startTime: TimeOfDay | null;
  teamId: Id | null;
  title: string;
}

interface QueueRecord {
  createdAt: Timestamp;
  recordType: "academic" | "athletic";
  student: { id: Id; name: string } | null;
  template: string | null;
}

// ---------------------------------------------------------------- helpers

const PERCENT = 100;
const WEEKS_SHOWN = 5;
const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 86_400_000;
const UNCLOSED_LOOKBACK_DAYS = 7;

function shiftDate(date: DateOnly, days: number): DateOnly {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, "YYYY-MM-DD".length);
}

/** Monday of the week containing `date`. */
function mondayOf(date: DateOnly): DateOnly {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftDate(date, -((weekday + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK));
}

/** Same rule as the server: (present + late) / (present + late + absent). */
function ratePercent(rows: AttendanceRow[]): number | null {
  let attended = 0;
  let counted = 0;
  for (const row of rows) {
    if (row.status === "present" || row.status === "late") {
      attended += 1;
      counted += 1;
    } else if (row.status === "absent") {
      counted += 1;
    }
  }
  return counted === 0 ? null : Math.round((attended / counted) * PERCENT);
}

function owedAmount(row: OutstandingRow): Money | null {
  const source = row.currentFee ?? row.lastPayment;
  return source ? { amount: source.amount, currency: source.currency } : null;
}

/** Adds decimal strings without floating point (two decimals, like the API). */
function sumAmounts(amounts: string[]): string {
  const cents = amounts.reduce((total, amount) => {
    const [whole = "0", fraction = ""] = amount.split(".");
    return (
      total + BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2))
    );
  }, 0n);
  const whole = cents / 100n;
  const rest = (cents % 100n).toString().padStart(2, "0");
  return `${whole}.${rest}`;
}

/**
 * "U14 training" on team U14 reads "U14 · Training" in the design: drop the team name the
 * title starts with, and capitalise what is left.
 */
function sessionTitle(title: string, teamName: string | null): string {
  const rest =
    teamName && title.toLowerCase().startsWith(`${teamName.toLowerCase()} `)
      ? title.slice(teamName.length + 1).trim()
      : title;
  return rest ? `${rest.charAt(0).toUpperCase()}${rest.slice(1)}` : title;
}

function recordLabel(record: QueueRecord): string {
  if (record.template === "report_card") {
    return "report card";
  }
  return record.recordType === "academic" ? "academic record" : "result";
}

async function fetchDashboardCounts(academyId: Id): Promise<DashboardResponse> {
  return await apiData<DashboardResponse>(academyPath(academyId, "/dashboard"));
}

/**
 * The most recent past session (last 7 days, attendance taken, team event) where some
 * of the team's students have no attendance row at all: what "Close out" fixes.
 */
function findUnclosedSession(input: {
  events: EventSessionRow[];
  attendance: AttendanceRow[];
  rosterSizes: Map<Id, number>;
  teamNames: Map<Id, string>;
  now: Date;
}): DashboardSummary["unclosedSession"] {
  const ended = input.events
    .filter(
      (e) =>
        e.collectAttendance &&
        !e.cancelled &&
        e.teamId &&
        e.endsAt &&
        Date.parse(e.endsAt) < input.now.getTime()
    )
    .sort((a, b) => (b.endsAt ?? "").localeCompare(a.endsAt ?? ""));
  for (const event of ended) {
    const recorded = new Set(
      input.attendance
        .filter(
          (row) =>
            row.eventId === event.id &&
            row.sessionDate === event.sessionDate &&
            !row.voidedAt
        )
        .map((row) => row.studentId)
    );
    const roster = input.rosterSizes.get(event.teamId ?? "") ?? 0;
    const missing = roster - recorded.size;
    if (missing > 0) {
      const teamName = input.teamNames.get(event.teamId ?? "") ?? null;
      return {
        title: sessionTitle(event.title, teamName),
        teamName,
        sessionDate: event.sessionDate,
        missingCheckIns: missing,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------- endpoints

/**
 * Everything the tiles and "Needs your attention" show.
 * GET /dashboard (counts), GET /attendance (five weeks, for the bars),
 * GET /fees/outstanding (amounts and top team), GET /records?status=pending&limit=1
 * (oldest waiting), GET /events + GET /teams (unclosed session) and
 * `organization.listInvitations` (expired invites).
 */
export async function getDashboard(academyId: Id): Promise<DashboardSummary> {
  if (mock) {
    return (await mock()).getDashboard(academyId);
  }
  const counts = await fetchDashboardCounts(academyId);
  const { today } = counts;
  const firstWeek = shiftDate(
    mondayOf(today),
    -DAYS_PER_WEEK * (WEEKS_SHOWN - 1)
  );
  const [attendance, outstanding, oldest, events, teams, invitations] =
    await Promise.all([
      apiAll<AttendanceRow>(academyPath(academyId, "/attendance"), {
        query: { from: firstWeek, to: today },
      }),
      apiAll<OutstandingRow>(academyPath(academyId, "/fees/outstanding"), {
        query: { on: today },
      }),
      apiPage<QueueRecord>(academyPath(academyId, "/records"), {
        query: { status: "pending", limit: 1 },
      }),
      apiAll<EventSessionRow>(academyPath(academyId, "/events"), {
        query: { from: shiftDate(today, -UNCLOSED_LOOKBACK_DAYS), to: today },
      }),
      fetchTeams(academyId),
      fetchInvitations(academyId),
    ]);

  const live = attendance.filter((row) => !row.voidedAt);
  const weekly = Array.from({ length: WEEKS_SHOWN }, (_, index) => {
    const from = shiftDate(firstWeek, index * DAYS_PER_WEEK);
    const to = shiftDate(from, DAYS_PER_WEEK - 1);
    const percent =
      ratePercent(
        live.filter((row) => row.sessionDate >= from && row.sessionDate <= to)
      ) ?? 0;
    return { weekStart: from, percent };
  });
  const thisWeek =
    counts.attendanceThisWeek.rate === null
      ? 0
      : Math.round(counts.attendanceThisWeek.rate * PERCENT);
  const lastWeek = weekly.at(-2)?.percent ?? thisWeek;

  const teamCounts = new Map<string, number>();
  for (const row of outstanding) {
    for (const team of row.teams) {
      teamCounts.set(team.name, (teamCounts.get(team.name) ?? 0) + 1);
    }
  }
  const [top] = [...teamCounts].sort((a, b) => b[1] - a[1]);
  const currency =
    outstanding.map(owedAmount).find((money) => money)?.currency ?? "";
  const total = sumAmounts(
    outstanding
      .map(owedAmount)
      .filter((money): money is Money => money?.currency === currency)
      .map((money) => money.amount)
  );

  const [oldestRecord] = oldest.data;
  const expired = invitations.filter((invite) => invite.status === "expired");

  return {
    attendance: {
      thisWeekPercent: thisWeek,
      changePts: thisWeek - lastWeek,
      // This week's bar uses the server's own rate, like the headline number.
      weekly: weekly.map((week, index) =>
        index === weekly.length - 1 ? { ...week, percent: thisWeek } : week
      ),
    },
    outstanding: {
      studentCount: counts.fees.outstandingStudents,
      total: { amount: total, currency },
      periodStart: `${today.slice(0, "YYYY-MM".length)}-01`,
      topTeam: top ? { name: top[0], count: top[1] } : null,
    },
    records: {
      pendingCount: counts.recordsAwaitingReview,
      oldest: oldestRecord
        ? {
            studentName: oldestRecord.student?.name ?? "A student",
            label: recordLabel(oldestRecord),
            createdAt: oldestRecord.createdAt,
          }
        : null,
    },
    unclosedSession: findUnclosedSession({
      events,
      attendance,
      rosterSizes: new Map(teams.map((t) => [t.id, t.studentCount])),
      teamNames: new Map(teams.map((t) => [t.id, t.name])),
      now: appNow(),
    }),
    expiredInvites: {
      coaches: expired.filter((invite) => invite.role === "coach").length,
      students: expired.filter((invite) => invite.role === "student").length,
    },
  };
}

/**
 * Today's sessions with live check-in counts.
 * GET /events?from=today&to=today + GET /attendance?date=today + GET /teams (roster sizes).
 */
export async function listTodaySessions(
  academyId: Id,
  date: DateOnly
): Promise<TodaySession[]> {
  if (mock) {
    return (await mock()).listTodaySessions(academyId, date);
  }
  const [events, attendance, teams, counts] = await Promise.all([
    apiAll<EventSessionRow>(academyPath(academyId, "/events"), {
      query: { from: date, to: date },
    }),
    apiAll<AttendanceRow>(academyPath(academyId, "/attendance"), {
      query: { date },
    }),
    fetchTeams(academyId),
    fetchDashboardCounts(academyId),
  ]);
  const now = appNow().getTime();
  const teamById = new Map(teams.map((t) => [t.id, t]));
  return events
    .filter((e) => !e.cancelled)
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))
    .map((e) => {
      const team = e.teamId ? teamById.get(e.teamId) : undefined;
      const checkedIn = attendance.filter(
        (row) =>
          row.eventId === e.id &&
          !row.voidedAt &&
          (row.status === "present" || row.status === "late")
      ).length;
      const live = Boolean(
        e.startsAt &&
          e.endsAt &&
          Date.parse(e.startsAt) <= now &&
          now <= Date.parse(e.endsAt)
      );
      return {
        eventId: e.id,
        title: sessionTitle(e.title, team?.name ?? null),
        teamName: team?.name ?? null,
        startTime: e.startTime,
        endTime: e.endTime,
        location: e.location,
        collectAttendance: e.collectAttendance,
        live,
        checkedIn: e.collectAttendance ? checkedIn : null,
        rosterSize: team
          ? team.studentCount
          : (counts.members.byRole.student ?? null),
      };
    });
}

/** GET /fees/outstanding?teamId= (every page), with each student's team. */
export async function listUnpaidStudents(
  academyId: Id,
  params: { teamId: Id | null }
): Promise<UnpaidPage> {
  if (mock) {
    return (await mock()).listUnpaidStudents(academyId, params);
  }
  const rows = await apiAll<OutstandingRow>(
    academyPath(academyId, "/fees/outstanding"),
    { query: { teamId: params.teamId } }
  );
  const data = rows.map(
    (row): UnpaidStudent => ({
      studentId: row.student.id,
      studentName: row.student.name,
      teamId: row.teams[0]?.id ?? null,
      teamName: row.teams[0]?.name ?? null,
      lastPaidAt: row.lastPayment?.paidAt ?? null,
      dueDate: row.currentFee?.dueDate ?? row.overdueSince,
      amount: owedAmount(row),
      // Joining dates aren't on this list; "Never paid" shows instead.
      joinedAt: null,
    })
  );
  return { data, total: data.length };
}

/** Teams for the "All teams" filter. GET /teams. */
export async function listDashboardTeams(
  academyId: Id
): Promise<{ id: Id; name: string }[]> {
  if (mock) {
    return (await mock()).listDashboardTeams(academyId);
  }
  const teams = await fetchTeams(academyId);
  return teams.map(({ id, name }) => ({ id, name }));
}
