/*
 * One person in an academy (stories AO-3, CO-7, CO-10): the admin's member detail
 * (/admin/members/$memberId, student or coach) and the coach's student detail
 * (/coach/students/$studentId). Real implementation over Better Auth and the /api/v1
 * read models; preview mode delegates to ./api.mock.ts.
 *
 * What the server allows, and so what each screen offers:
 * - Academy admins read everyone and change coaches and students only: team moves
 *   (`organization.addTeamMember` / `removeTeamMember`, one team per student), coach
 *   <-> student (`organization.updateMemberRole`) and removal (`organization.removeMember`).
 *   Admin roles belong to the platform owner (hooks in packages/auth/src/index.ts).
 * - Coaches read only students on their own teams (GET /students/:id/records answers 404
 *   for anyone else) and may only take a student off one of their teams.
 * - Not served by any endpoint, so left out in real mode: "last seen", how someone
 *   joined ("with an email invite"), sign-in method, and the planned / cancelled /
 *   closed-on-time session counts.
 */

import { countAttendance } from "@/features/member-detail/model";
import {
  fetchOrgMembers,
  fetchTeamsWithRosters,
} from "@/features/members/directory";
import { formatResult } from "@/features/results/templates";
import type {
  AcademyRole,
  AttendanceStatus,
  DateOnly,
  Id,
  PaymentMethod,
  RecordStatus,
  RecordType,
  Timestamp,
} from "@/features/types";
import {
  ApiError,
  academyPath,
  apiAll,
  apiData,
  apiPage,
  unwrapAuth,
} from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { firstName, formatTime } from "@/lib/format";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

export type DetailScope = "admin" | "coach";

export interface ProfileTeam {
  coaches: { id: Id; name: string }[];
  id: Id;
  name: string;
  studentCount: number;
}

export interface MemberProfile {
  email: string;
  image: string | null;
  joinedAt: Timestamp;
  /** "with an email invite": not stored by the server, null in real mode. */
  joinedVia: string | null;
  /** Not served to admins by any endpoint: null in real mode. */
  lastSeenAt: Timestamp | null;
  memberId: Id;
  name: string;
  roles: AcademyRole[];
  /** "Email and password": not served for other users, null in real mode. */
  signIn: string | null;
  /** "basketball": not in the schema, null in real mode. */
  sport: string | null;
  teams: ProfileTeam[];
  userId: Id;
}

export interface AttendanceSession {
  date: DateOnly;
  detail: string;
  id: Id;
  status: AttendanceStatus;
  title: string;
}

export interface AttendanceMonth {
  absent: number;
  excused: number;
  late: number;
  present: number;
  /** (present + late) / (present + late + absent); null with no counted session. */
  rate: number | null;
  /** Newest first. */
  sessions: AttendanceSession[];
}

export interface StudentRecordItem {
  hasFile: boolean;
  id: Id;
  /** "Free throws", "Report card". */
  label: string;
  recordedById: Id;
  recordedByName: string;
  recordedOn: DateOnly;
  recordType: RecordType;
  /** "7 of 10" for results; null when there is no single score. */
  score: string | null;
  status: RecordStatus;
  /** "first term" for report cards. */
  term: string | null;
  verifiedByName: string | null;
}

export interface StudentRecords {
  items: StudentRecordItem[];
  /** All the student's records (the list holds the newest). */
  total: number;
}

export interface FeePayment {
  amount: string;
  currency: string;
  id: Id;
  method: PaymentMethod | null;
  paidAt: Timestamp | null;
  periodStart: DateOnly;
}

export interface StudentFees {
  /** Paid months, newest first; null for coaches (they only see that a month is unpaid). */
  history: FeePayment[] | null;
  unpaid: {
    amount: string | null;
    currency: string | null;
    daysOverdue: number | null;
    /** A date in the unpaid month ("November unpaid"). */
    month: DateOnly;
  } | null;
}

export interface CoachSession {
  date: DateOnly;
  detail: string;
  key: string;
  status: "live" | "closed";
  title: string;
}

export interface CoachSummary {
  /** Team attendance this month on the teams they coach, 0..1. */
  attendanceRate: number | null;
  /** Not served by the API: null in real mode. */
  cancelled: number | null;
  closedOnTime: number | null;
  planned: number | null;
  recentSessions: CoachSession[];
  resultsLogged: number;
  /** Sessions on their teams that have attendance this month. */
  sessionsRun: number;
  /** Attendance rows they entered by hand. */
  tickedByHand: number;
}

export interface CoachRecordGroup {
  detail: string;
  key: string;
  recordType: RecordType;
  status: RecordStatus;
  title: string;
}

export interface CoachRecords {
  groups: CoachRecordGroup[];
  /** Records waiting for review that this coach can review. */
  pendingForThem: number;
  total: number;
}

const RECORD_PAGE = 50;
const HTTP_NOT_FOUND = 404;

function notFound(message: string): ApiError {
  return new ApiError({ status: HTTP_NOT_FOUND, code: "not_found", message });
}

function monthRange(
  month: string,
  today: DateOnly
): { from: DateOnly; to: DateOnly } {
  const from = `${month}-01`;
  const [year = 0, mon = 1] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);
  return { from, to: end < today ? end : today };
}

// ---------------------------------------------------------------- profile

/**
 * The person, their roles and the teams they are on (with each team's coaches).
 * Better Auth `organization.getFullOrganization` (members) + GET /teams and
 * GET /teams/:id/members (rosters). For a coach, GET /students/:id/records first: the
 * server answers 404 unless the student is on one of their teams.
 */
export async function getMemberProfile(
  academyId: Id,
  id: Id,
  scope: DetailScope
): Promise<MemberProfile> {
  if (mock) {
    return (await mock()).getMemberProfile(academyId, id, scope);
  }
  if (scope === "coach") {
    await apiPage(
      academyPath(academyId, `/students/${encodeURIComponent(id)}/records`),
      { query: { limit: 1 } }
    );
  }
  const [members, { teams, rosters }] = await Promise.all([
    fetchOrgMembers(academyId),
    fetchTeamsWithRosters(academyId),
  ]);
  const member = members.find((m) => m.id === id || m.userId === id);
  if (!member) {
    throw notFound("Member not found");
  }
  const onTeams = teams.filter((team) =>
    (rosters.get(team.id) ?? []).some((row) => row.userId === member.userId)
  );
  if (scope === "coach" && onTeams.length === 0) {
    throw notFound("Student not found");
  }
  return {
    memberId: member.id,
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    image: member.user.image,
    roles: member.roles,
    joinedAt: member.createdAt,
    joinedVia: null,
    lastSeenAt: null,
    signIn: null,
    sport: null,
    teams: onTeams.map((team) => ({
      id: team.id,
      name: team.name,
      studentCount: team.studentCount,
      coaches: (rosters.get(team.id) ?? [])
        .filter((row) => row.roles.includes("coach"))
        .map((row) => ({ id: row.userId, name: row.name })),
    })),
  };
}

// ---------------------------------------------------------------- attendance

interface ServerAttendance {
  checkInAt: Timestamp | null;
  eventId: Id;
  id: Id;
  recordedBy: { id: Id; name: string } | null;
  recordedById: Id | null;
  sessionDate: DateOnly;
  status: AttendanceStatus;
  studentId: Id;
  voidedAt: Timestamp | null;
}

interface ServerEvent {
  id: Id;
  teamId: Id | null;
  title: string;
}

async function eventTitles(
  academyId: Id,
  range: { from: DateOnly; to: DateOnly }
): Promise<Map<Id, string>> {
  const events = await apiAll<ServerEvent>(academyPath(academyId, "/events"), {
    query: range,
  });
  return new Map(events.map((event) => [event.id, event.title]));
}

function byWhom(row: ServerAttendance, viewerId: Id): string | null {
  if (!row.recordedById || row.recordedById === row.studentId) {
    return null;
  }
  if (row.recordedById === viewerId) {
    return "you";
  }
  return row.recordedBy ? `Coach ${firstName(row.recordedBy.name)}` : "a coach";
}

function sessionDetail(
  row: ServerAttendance,
  viewerId: Id,
  timeZone: string
): string {
  const by = byWhom(row, viewerId);
  if (row.status === "absent") {
    return by ? `marked absent by ${by}` : "never checked in";
  }
  if (row.status === "excused") {
    return by ? `excused by ${by}` : "excused";
  }
  if (!by && row.checkInAt) {
    return `checked in ${formatTime(row.checkInAt, timeZone)} by QR`;
  }
  return by ? `ticked by ${by}` : "checked in";
}

/**
 * One student's sessions in a month. GET /attendance?studentId=&from=&to= (coaches see
 * their own students only; voided rows are left out) and GET /events (session names).
 */
export async function getStudentAttendance(
  academyId: Id,
  studentId: Id,
  params: { month: string; today: DateOnly; viewerId: Id; timeZone: string }
): Promise<AttendanceMonth> {
  if (mock) {
    return (await mock()).getStudentAttendance(academyId, studentId, params);
  }
  const range = monthRange(params.month, params.today);
  const [rows, titles] = await Promise.all([
    apiAll<ServerAttendance>(academyPath(academyId, "/attendance"), {
      query: { studentId, ...range },
    }),
    eventTitles(academyId, range),
  ]);
  const sessions = rows
    .filter((row) => !row.voidedAt)
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
    .map((row) => ({
      id: row.id,
      date: row.sessionDate,
      status: row.status,
      title: titles.get(row.eventId) ?? "Session",
      detail: sessionDetail(row, params.viewerId, params.timeZone),
    }));
  return { ...countAttendance(sessions), sessions };
}

// ---------------------------------------------------------------- records

interface ServerRecord {
  data: Record<string, unknown>;
  hasFile: boolean;
  id: Id;
  recordedBy: { id: Id; name: string } | null;
  recordedById: Id;
  recordedOn: DateOnly;
  recordType: RecordType;
  status: RecordStatus;
  student: { id: Id; name: string } | null;
  studentId: Id;
  verifiedBy?: { id: Id; name: string } | null;
  verifiedById: Id | null;
}

const ACADEMIC_LABEL: Record<string, string> = { report_card: "Report card" };

function describeRecord(row: ServerRecord): {
  label: string;
  score: string | null;
  term: string | null;
} {
  if (row.recordType === "academic") {
    const key = typeof row.data.template === "string" ? row.data.template : "";
    const term = typeof row.data.term === "string" ? row.data.term : null;
    return {
      label: ACADEMIC_LABEL[key] ?? "Academic record",
      score: null,
      term: term ? term.charAt(0).toLowerCase() + term.slice(1) : null,
    };
  }
  const [label = "Result", score = null] = formatResult(row.data).split(" · ");
  return { label, score, term: null };
}

function toRecordItem(row: ServerRecord): StudentRecordItem {
  return {
    id: row.id,
    recordType: row.recordType,
    recordedOn: row.recordedOn,
    status: row.status,
    hasFile: row.hasFile,
    recordedById: row.recordedById,
    recordedByName: row.recordedBy?.name ?? "Someone",
    verifiedByName: row.verifiedBy?.name ?? null,
    ...describeRecord(row),
  };
}

/** GET /students/:studentId/records (newest first; coaches: own students only). */
export async function getStudentRecords(
  academyId: Id,
  studentId: Id
): Promise<StudentRecords> {
  if (mock) {
    return (await mock()).getStudentRecords(academyId, studentId);
  }
  const rows = await apiAll<ServerRecord>(
    academyPath(
      academyId,
      `/students/${encodeURIComponent(studentId)}/records`
    ),
    { maxItems: 500 }
  );
  return {
    items: rows.slice(0, RECORD_PAGE).map(toRecordItem),
    total: rows.length,
  };
}

// ---------------------------------------------------------------- fees

interface ServerOutstanding {
  currentFee: { amount: string; currency: string; dueDate: DateOnly } | null;
  daysOverdue: number | null;
  overdueSince: DateOnly | null;
  student: { id: Id };
}

interface ServerFee {
  amount: string;
  currency: string;
  id: Id;
  paidAt: Timestamp | null;
  paymentMethod: PaymentMethod | null;
  periodStart: DateOnly;
  voidedAt: Timestamp | null;
}

/**
 * Unpaid month from GET /fees/outstanding?on=today (coaches: their students only), and
 * for admins the paid months from GET /fees?studentId=.
 */
export async function getStudentFees(
  academyId: Id,
  studentId: Id,
  params: { today: DateOnly; scope: DetailScope }
): Promise<StudentFees> {
  if (mock) {
    return (await mock()).getStudentFees(academyId, studentId, params);
  }
  const [outstanding, fees] = await Promise.all([
    apiAll<ServerOutstanding>(academyPath(academyId, "/fees/outstanding"), {
      query: { on: params.today },
    }),
    params.scope === "admin"
      ? apiAll<ServerFee>(academyPath(academyId, "/fees"), {
          query: { studentId },
        })
      : Promise.resolve(null),
  ]);
  const owed = outstanding.find((row) => row.student.id === studentId);
  return {
    unpaid: owed
      ? {
          amount: owed.currentFee?.amount ?? null,
          currency: owed.currentFee?.currency ?? null,
          daysOverdue: owed.daysOverdue,
          month: owed.overdueSince ?? owed.currentFee?.dueDate ?? params.today,
        }
      : null,
    history: fees
      ? fees
          .filter((fee) => !fee.voidedAt && fee.paidAt)
          .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
          .map((fee) => ({
            id: fee.id,
            amount: fee.amount,
            currency: fee.currency,
            paidAt: fee.paidAt,
            method: fee.paymentMethod,
            periodStart: fee.periodStart,
          }))
      : null,
  };
}

// ---------------------------------------------------------------- coach work

interface ServerTeamSummary {
  team: { absent: number; late: number; present: number };
}

async function fetchStaffRecords(academyId: Id): Promise<ServerRecord[]> {
  const statuses: RecordStatus[] = ["pending", "verified", "rejected"];
  const pages = await Promise.all(
    statuses.map((status) =>
      apiPage<ServerRecord>(academyPath(academyId, "/records"), {
        query: { status, limit: 200 },
      })
    )
  );
  return pages.flatMap((page) => page.data);
}

/**
 * What a coach did in a month on the teams they coach. GET /attendance?teamId=&from=&to=
 * and GET /teams/:id/attendance-summary per team, GET /events (names), GET /records
 * (results they logged). Admin view only.
 */
export async function getCoachSummary(
  academyId: Id,
  coachId: Id,
  params: { month: string; today: DateOnly; teamIds: Id[] }
): Promise<CoachSummary> {
  if (mock) {
    return (await mock()).getCoachSummary(academyId, coachId, params);
  }
  const range = monthRange(params.month, params.today);
  const [rowLists, summaries, titles, records] = await Promise.all([
    Promise.all(
      params.teamIds.map((teamId) =>
        apiAll<ServerAttendance>(academyPath(academyId, "/attendance"), {
          query: { teamId, ...range },
        })
      )
    ),
    Promise.all(
      params.teamIds.map((teamId) =>
        apiData<ServerTeamSummary>(
          academyPath(
            academyId,
            `/teams/${encodeURIComponent(teamId)}/attendance-summary`
          ),
          { query: range }
        )
      )
    ),
    eventTitles(academyId, range),
    fetchStaffRecords(academyId),
  ]);
  const rows = rowLists.flat().filter((row) => !row.voidedAt);
  const sessions = new Map<string, ServerAttendance[]>();
  for (const row of rows) {
    const key = `${row.eventId}|${row.sessionDate}`;
    sessions.set(key, [...(sessions.get(key) ?? []), row]);
  }
  const totals = summaries.reduce(
    (sum, s) => ({
      attended: sum.attended + s.team.present + s.team.late,
      counted: sum.counted + s.team.present + s.team.late + s.team.absent,
    }),
    { attended: 0, counted: 0 }
  );
  const recent = [...sessions.entries()]
    .sort(([a], [b]) =>
      (b.split("|")[1] ?? "").localeCompare(a.split("|")[1] ?? "")
    )
    .slice(0, 3)
    .map(([key, list]): CoachSession => {
      const [eventId = "", date = ""] = key.split("|");
      const byHand = list.filter((r) => r.recordedById === coachId).length;
      const live = date === params.today;
      const checkedIn = list.filter(
        (r) => r.status === "present" || r.status === "late"
      ).length;
      return {
        key,
        date,
        title: titles.get(eventId) ?? "Session",
        status: live ? "live" : "closed",
        detail: live
          ? `${checkedIn} checked in so far`
          : `${byHand} ticked by hand`,
      };
    });
  return {
    sessionsRun: sessions.size,
    tickedByHand: rows.filter((row) => row.recordedById === coachId).length,
    attendanceRate:
      totals.counted === 0 ? null : totals.attended / totals.counted,
    resultsLogged: records.filter(
      (r) =>
        r.recordedById === coachId &&
        r.recordType === "athletic" &&
        r.recordedOn >= range.from &&
        r.recordedOn <= range.to
    ).length,
    recentSessions: recent,
    planned: null,
    cancelled: null,
    closedOnTime: null,
  };
}

function dayLabel(date: DateOnly, today: DateOnly): string {
  if (date === today) {
    return "today";
  }
  const day = new Date(`${date}T12:00:00Z`);
  return `${day.getUTCDate()} ${day.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}`;
}

/**
 * Results a coach logged (grouped per drill and day) and records they reviewed.
 * GET /records?status= (the academy admin's view of every student's records).
 */
export async function getCoachRecords(
  academyId: Id,
  coachId: Id,
  params: { today: DateOnly }
): Promise<CoachRecords> {
  if (mock) {
    return (await mock()).getCoachRecords(academyId, coachId, params);
  }
  const records = await fetchStaffRecords(academyId);
  const logged = records.filter((r) => r.recordedById === coachId);
  const reviewed = records.filter(
    (r) => r.verifiedById === coachId && r.recordedById !== coachId
  );
  const groups = new Map<string, ServerRecord[]>();
  for (const row of logged) {
    const key = `${row.recordedOn}|${describeRecord(row).label}|${row.status}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const loggedGroups = [...groups.entries()].map(
    ([key, list]): CoachRecordGroup & { date: DateOnly } => {
      const [first] = list;
      const { label } = first ? describeRecord(first) : { label: "Result" };
      const names = list
        .slice(0, 2)
        .map((r) => {
          const { score } = describeRecord(r);
          return `${r.student?.name ?? "A student"}${score ? ` ${score}` : ""}`;
        })
        .join(", ");
      const date = first?.recordedOn ?? params.today;
      return {
        key,
        date,
        recordType: first?.recordType ?? "athletic",
        status: first?.status ?? "pending",
        title:
          list.length === 1
            ? `${label}, ${first?.student?.name ?? "a student"}`
            : `${label}, ${list.length} students`,
        detail: `Logged ${dayLabel(date, params.today)}. ${names}`,
      };
    }
  );
  const reviewedGroups = reviewed.map(
    (r): CoachRecordGroup & { date: DateOnly } => ({
      key: r.id,
      date: r.recordedOn,
      recordType: r.recordType,
      status: r.status,
      title: `${describeRecord(r).label}, ${r.student?.name ?? "a student"}`,
      detail: `${r.status === "rejected" ? "Rejected" : "Reviewed"} · recorded ${dayLabel(r.recordedOn, params.today)}`,
    })
  );
  const all = [...loggedGroups, ...reviewedGroups].sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  return {
    groups: all.map(({ date: _date, ...group }) => group),
    total: logged.length + reviewed.length,
    pendingForThem: 0,
  };
}

// ---------------------------------------------------------------- actions

export interface MoveStudentInput {
  academyId: Id;
  fromTeamId: Id | null;
  /** null takes them off their team. */
  toTeamId: Id | null;
  userId: Id;
}

/**
 * Better Auth allows one team per student, so a move takes them off the old team
 * (`organization.removeTeamMember`) and then adds them (`addTeamMember`); if the add
 * fails they are put back. Both write `team.member_*` rows to the activity log.
 */
export async function moveStudent(input: MoveStudentInput): Promise<void> {
  if (mock) {
    return (await mock()).moveStudent(input);
  }
  const { academyId, userId, fromTeamId, toTeamId } = input;
  if (fromTeamId) {
    unwrapAuth(
      await authClient.organization.removeTeamMember({
        teamId: fromTeamId,
        userId,
        organizationId: academyId,
      })
    );
  }
  if (!toTeamId) {
    return;
  }
  const added = await authClient.organization.addTeamMember({
    teamId: toTeamId,
    userId,
    organizationId: academyId,
  });
  if (added.error && fromTeamId) {
    await authClient.organization.addTeamMember({
      teamId: fromTeamId,
      userId,
      organizationId: academyId,
    });
  }
  unwrapAuth(added);
}

export interface SetTeamsInput {
  academyId: Id;
  add: Id[];
  remove: Id[];
  userId: Id;
}

/** A coach's teams: `addTeamMember` / `removeTeamMember` per changed team. */
export async function setCoachTeams(input: SetTeamsInput): Promise<void> {
  if (mock) {
    return (await mock()).setCoachTeams(input);
  }
  const { academyId, userId } = input;
  const results = await Promise.all([
    ...input.remove.map((teamId) =>
      authClient.organization.removeTeamMember({
        teamId,
        userId,
        organizationId: academyId,
      })
    ),
    ...input.add.map((teamId) =>
      authClient.organization.addTeamMember({
        teamId,
        userId,
        organizationId: academyId,
      })
    ),
  ]);
  for (const result of results) {
    if (result.error) {
      unwrapAuth({ data: null, error: result.error });
    }
  }
}

export interface ChangeRoleInput {
  academyId: Id;
  memberId: Id;
  role: "coach" | "student";
}

/**
 * `organization.updateMemberRole({ memberId, role })`. The server refuses admin changes
 * (platform owner only) and making someone on several teams a student.
 */
export async function changeRole(input: ChangeRoleInput): Promise<void> {
  if (mock) {
    return (await mock()).changeRole(input);
  }
  unwrapAuth(
    await authClient.organization.updateMemberRole({
      memberId: input.memberId,
      role: input.role,
      organizationId: input.academyId,
    })
  );
}

/** `organization.removeMember({ memberIdOrEmail })`; admins are the owner's to remove. */
export async function removeMember(input: {
  academyId: Id;
  memberId: Id;
}): Promise<void> {
  if (mock) {
    return (await mock()).removeMember(input);
  }
  unwrapAuth(
    await authClient.organization.removeMember({
      memberIdOrEmail: input.memberId,
      organizationId: input.academyId,
    })
  );
}

/** A coach takes a student off one of their teams: `organization.removeTeamMember`. */
export async function removeFromTeam(input: {
  academyId: Id;
  teamId: Id;
  userId: Id;
}): Promise<void> {
  if (mock) {
    return (await mock()).removeFromTeam(input);
  }
  unwrapAuth(
    await authClient.organization.removeTeamMember({
      teamId: input.teamId,
      userId: input.userId,
      organizationId: input.academyId,
    })
  );
}
