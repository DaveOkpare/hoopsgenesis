/*
 * Team page (AO-3, CO-7, CO-10) and the "U14 this month" table on coach Today.
 * Real implementation over the /api/v1 read models and Better Auth's roster calls.
 * Preview mode delegates to ./api.mock.ts.
 */
import {
  fetchMembersWithTeams,
  fetchTeamRoster,
  fetchTeams,
} from "@/features/members/directory";
import type { DateOnly, Id, Team, UserSummary } from "@/features/types";
import {
  academyPath,
  apiAll,
  apiData,
  apiPage,
  unwrapAuth,
} from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

export type TeamFeeStatus =
  | { kind: "overdue"; days: number }
  | { kind: "paid"; paidTo: DateOnly }
  /** No payment covers today and no due date is known (never paid, or due today). */
  | { kind: "unpaid" };

export interface TeamStudent {
  /** This month, (present + late) / (present + late + absent); null with no sessions. */
  attendancePercent: number | null;
  fee: TeamFeeStatus;
  /** Last session they attended (present or late) in the past 60 days. */
  lastSessionOn: DateOnly | null;
  /** Latest verified athletic result, ready to show ("100 m sprint · 12.3 s"). */
  latestResult: string | null;
  user: UserSummary;
}

export interface TeamCoach {
  user: UserSummary;
}

export interface TeamDetail {
  coaches: TeamCoach[];
  /** Not in the schema (shown in the eyebrow: "Basketball · Under 14"); null in real mode. */
  sport: string | null;
  students: TeamStudent[];
  team: Team;
}

/** A person found by "Add a student to U14" / "Add a coach" (identified by user id). */
export interface MemberCandidate {
  /** Team they are on now (students can be on one team only); null when unknown. */
  currentTeam: Pick<Team, "id" | "name"> | null;
  /** Not stored; real mode says "they". */
  pronoun: "she" | "he" | "they";
  role: "student" | "coach";
  user: UserSummary;
}

const PERCENT = 100;
const LAST_SESSION_LOOKBACK_DAYS = 60;
const MS_PER_DAY = 86_400_000;

function shiftDate(date: DateOnly, days: number): DateOnly {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, "YYYY-MM-DD".length);
}

interface AttendanceSummary {
  students: { rate: number | null; studentId: Id }[];
}

interface AttendanceRow {
  sessionDate: DateOnly;
  status: string;
  studentId: Id;
  voidedAt: string | null;
}

interface OutstandingRow {
  daysOverdue: number | null;
  student: { id: Id };
}

interface FeeRow {
  paidAt: string | null;
  periodEnd: DateOnly;
  status: string;
  studentId: Id;
  voidedAt: string | null;
}

interface RecordRow {
  data: Record<string, unknown>;
  template: string | null;
}

interface TemplateRow {
  key: string;
  label: string;
  metrics: { field: string; label: string; unit: string | null }[];
}

/** "100 m sprint · 12.34 s" from a record and its template's first metric. */
function describeResult(
  record: RecordRow,
  templates: TemplateRow[]
): string | null {
  const template = templates.find((t) => t.key === record.template);
  if (!template) {
    return null;
  }
  const [metric] = template.metrics;
  const value = metric ? record.data[metric.field] : undefined;
  if (!metric || value === undefined || value === null) {
    return template.label;
  }
  return `${template.label} · ${String(value)}${metric.unit ? ` ${metric.unit}` : ""}`;
}

async function latestResults(
  academyId: Id,
  studentIds: Id[]
): Promise<Map<Id, string | null>> {
  const templates = await apiData<TemplateRow[]>(
    academyPath(academyId, "/record-templates"),
    { query: { recordType: "athletic" } }
  );
  const latest = await Promise.all(
    studentIds.map((studentId) =>
      apiPage<RecordRow>(
        academyPath(
          academyId,
          `/students/${encodeURIComponent(studentId)}/records`
        ),
        { query: { recordType: "athletic", status: "verified", limit: 1 } }
      )
    )
  );
  return new Map(
    studentIds.map((id, index) => {
      const record = latest[index]?.data[0];
      return [id, record ? describeResult(record, templates) : null];
    })
  );
}

function feeStatusFor(
  studentId: Id,
  outstanding: Map<Id, OutstandingRow>,
  paid: Map<Id, DateOnly>
): TeamFeeStatus {
  const owed = outstanding.get(studentId);
  if (owed) {
    return owed.daysOverdue && owed.daysOverdue > 0
      ? { kind: "overdue", days: owed.daysOverdue }
      : { kind: "unpaid" };
  }
  const paidTo = paid.get(studentId);
  return paidTo ? { kind: "paid", paidTo } : { kind: "unpaid" };
}

function lastSessions(rows: AttendanceRow[]): Map<Id, DateOnly> {
  const last = new Map<Id, DateOnly>();
  for (const row of rows) {
    const attended = row.status === "present" || row.status === "late";
    const previous = last.get(row.studentId);
    if (
      attended &&
      !row.voidedAt &&
      (!previous || row.sessionDate > previous)
    ) {
      last.set(row.studentId, row.sessionDate);
    }
  }
  return last;
}

function paidThrough(rows: FeeRow[]): Map<Id, DateOnly> {
  const paid = new Map<Id, DateOnly>();
  for (const row of rows) {
    const previous = paid.get(row.studentId);
    if (
      row.paidAt &&
      !row.voidedAt &&
      (!previous || row.periodEnd > previous)
    ) {
      paid.set(row.studentId, row.periodEnd);
    }
  }
  return paid;
}

/**
 * Team with its students, coaches, attendance this month and fee status (read-only).
 * GET /teams (the team), GET /teams/:teamId/members (roster),
 * GET /teams/:teamId/attendance-summary (this month), GET /attendance?teamId= (last
 * session), GET /fees/outstanding?teamId= and GET /fees?teamId=&from=today&to=today
 * (fees), GET /students/:id/records?recordType=athletic&status=verified&limit=1 and
 * GET /record-templates (latest result).
 */
export async function getTeamDetail(
  academyId: Id,
  teamId: Id,
  params: { today: DateOnly }
): Promise<TeamDetail> {
  if (mock) {
    return (await mock()).getTeamDetail(academyId, teamId, params);
  }
  const { today } = params;
  const teamPath = `/teams/${encodeURIComponent(teamId)}`;
  const [teams, roster] = await Promise.all([
    fetchTeams(academyId),
    fetchTeamRoster(academyId, teamId),
  ]);
  const team = teams.find((t) => t.id === teamId);
  if (!team) {
    throw new Error("Team not found");
  }
  const studentRows = roster.filter((row) => row.roles.includes("student"));
  const studentIds = studentRows.map((row) => row.userId);
  const [summary, attendance, outstanding, fees, results] = await Promise.all([
    apiData<AttendanceSummary>(
      academyPath(academyId, `${teamPath}/attendance-summary`),
      { query: { from: `${today.slice(0, "YYYY-MM".length)}-01`, to: today } }
    ),
    apiAll<AttendanceRow>(academyPath(academyId, "/attendance"), {
      query: {
        teamId,
        from: shiftDate(today, -LAST_SESSION_LOOKBACK_DAYS),
        to: today,
      },
    }),
    apiAll<OutstandingRow>(academyPath(academyId, "/fees/outstanding"), {
      query: { teamId, on: today },
    }),
    apiAll<FeeRow>(academyPath(academyId, "/fees"), {
      query: { teamId, from: today, to: today },
    }),
    latestResults(academyId, studentIds),
  ]);
  const rates = new Map(
    summary.students.map((row) => [row.studentId, row.rate])
  );
  const owed = new Map(outstanding.map((row) => [row.student.id, row]));
  const paid = paidThrough(fees);
  const last = lastSessions(attendance);
  const toUser = (row: (typeof roster)[number]): UserSummary => ({
    id: row.userId,
    name: row.name,
    image: row.image,
    email: "",
  });
  return {
    team: {
      id: team.id,
      academyId: team.academyId,
      name: team.name,
      ageGroup: team.ageGroup,
      createdAt: team.createdAt,
    },
    sport: null,
    students: studentRows.map((row) => {
      const rate = rates.get(row.userId);
      return {
        user: toUser(row),
        attendancePercent:
          rate === null || rate === undefined
            ? null
            : Math.round(rate * PERCENT),
        lastSessionOn: last.get(row.userId) ?? null,
        latestResult: results.get(row.userId) ?? null,
        fee: feeStatusFor(row.userId, owed, paid),
      };
    }),
    coaches: roster
      .filter((row) => row.roles.includes("coach"))
      .map((row) => ({ user: toUser(row) })),
  };
}

/**
 * Academy members to add to a team, matching a name or email.
 * Better Auth members + GET /teams rosters, filtered here. An academy admin sees every
 * roster, so a student on another team shows "Already on U12" and "Move here". A coach
 * sees only their own teams' rosters, so another team's student shows as addable; Better
 * Auth's one-team rule then refuses the add and the error says to ask an admin.
 */
export async function searchMembersForTeam(
  academyId: Id,
  params: { teamId: Id; query: string; role: "student" | "coach" }
): Promise<MemberCandidate[]> {
  if (mock) {
    return (await mock()).searchMembersForTeam(academyId, params);
  }
  const query = params.query.trim().toLowerCase();
  if (!query) {
    return [];
  }
  const { members, teams } = await fetchMembersWithTeams(academyId);
  return members
    .filter(
      (m) =>
        m.roles.includes(params.role) &&
        !m.teamIds.includes(params.teamId) &&
        (m.user.name.toLowerCase().includes(query) ||
          m.user.email.toLowerCase().startsWith(query))
    )
    .map((m) => {
      const current = teams.find((t) => m.teamIds.includes(t.id)) ?? null;
      return {
        user: m.user,
        role: params.role,
        pronoun: "they" as const,
        currentTeam:
          params.role === "student" && current
            ? { id: current.id, name: current.name }
            : null,
      };
    });
}

/**
 * Add someone to a team: `organization.addTeamMember({ teamId, userId })`. A student
 * already on another team (`fromTeamId`) is moved: Better Auth allows one team per
 * student, so they come off the old team first (`organization.removeTeamMember`); if the
 * add then fails they are put back.
 */
export async function addTeamMember(
  academyId: Id,
  input: { teamId: Id; userId: Id; fromTeamId?: Id | null }
): Promise<{ movedFrom: Id | null }> {
  if (mock) {
    return (await mock()).addTeamMember(academyId, input);
  }
  const fromTeamId = input.fromTeamId ?? null;
  if (fromTeamId) {
    unwrapAuth(
      await authClient.organization.removeTeamMember({
        teamId: fromTeamId,
        userId: input.userId,
        organizationId: academyId,
      })
    );
  }
  const added = await authClient.organization.addTeamMember({
    teamId: input.teamId,
    userId: input.userId,
    organizationId: academyId,
  });
  if (added.error && fromTeamId) {
    await authClient.organization.addTeamMember({
      teamId: fromTeamId,
      userId: input.userId,
      organizationId: academyId,
    });
  }
  unwrapAuth(added);
  return { movedFrom: fromTeamId };
}

/** `organization.removeTeamMember({ teamId, userId })`. */
export async function removeTeamMember(
  academyId: Id,
  input: { teamId: Id; userId: Id }
): Promise<void> {
  if (mock) {
    return (await mock()).removeTeamMember(academyId, input);
  }
  unwrapAuth(
    await authClient.organization.removeTeamMember({
      teamId: input.teamId,
      userId: input.userId,
      organizationId: academyId,
    })
  );
}
