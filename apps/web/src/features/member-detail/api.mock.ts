/*
 * Preview-mode (fixture) implementation of features/member-detail/api.ts. Dev only.
 * Aline Uwase and Patrick Habimana carry the numbers drawn in 8JO-0, 7F2-0, DNS-0,
 * CHQ-0, DTR-0 and CB8-0; everyone else gets an honest empty page. Members live in the
 * members mock's store so a move, role change or removal shows on the list too.
 */

import { fixtureDelay, teams as teamFixtures } from "@/features/fixtures";
import type {
  AttendanceMonth,
  AttendanceSession,
  ChangeRoleInput,
  CoachRecords,
  CoachSummary,
  DetailScope,
  MemberProfile,
  MoveStudentInput,
  SetTeamsInput,
  StudentFees,
  StudentRecordItem,
  StudentRecords,
} from "@/features/member-detail/api";
import { countAttendance } from "@/features/member-detail/model";
import { storedMembers, updateStoredMember } from "@/features/members/api.mock";
import type { DateOnly, Id, Member } from "@/features/types";
import { ApiError } from "@/lib/api-client";

const ALINE = "user-aline";
const PATRICK = "user-patrick";
const ONE_TEAM_MESSAGE = "A student can be on only one team per academy";
const OWNER_ONLY_MESSAGE =
  "Only the platform owner appoints or removes academy admins";

/** Team sizes drawn in DNS-0 ("18 students", "15 students"). */
const STUDENT_COUNTS: Record<Id, number> = { "team-u14": 18, "team-u16": 15 };

const PROFILE_EXTRAS: Record<
  Id,
  Pick<MemberProfile, "joinedVia" | "lastSeenAt" | "signIn" | "sport">
> = {
  [ALINE]: {
    joinedVia: "with an invite link",
    lastSeenAt: "2026-11-23T13:42:00Z",
    signIn: "Email and password",
    sport: "basketball",
  },
  [PATRICK]: {
    joinedVia: "with a coach join code",
    lastSeenAt: "2026-11-23T14:05:00Z",
    signIn: "Email and password",
    sport: "basketball",
  },
};

function apiError(status: number, message: string): ApiError {
  return new ApiError({ status, code: `http_${status}`, message });
}

function findMember(academyId: Id, id: Id): Member {
  const member = storedMembers(academyId).find(
    (m) => m.id === id || m.userId === id
  );
  if (!member) {
    throw apiError(404, "Member not found");
  }
  return member;
}

export async function getMemberProfile(
  academyId: Id,
  id: Id,
  scope: DetailScope
): Promise<MemberProfile> {
  await fixtureDelay();
  const member = findMember(academyId, id);
  const everyone = storedMembers(academyId);
  // The preview coach is Sharika (U12, U14, U16): others' students answer 404.
  const viewer = everyone.find((m) => m.userId === "user-sharika");
  const shared = member.teamIds.some((t) => viewer?.teamIds.includes(t));
  if (scope === "coach" && !(shared && member.roles.includes("student"))) {
    throw apiError(404, "Student not found");
  }
  const extras = PROFILE_EXTRAS[member.userId] ?? {
    joinedVia: null,
    lastSeenAt: null,
    signIn: null,
    sport: null,
  };
  return {
    memberId: member.id,
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    image: member.user.image,
    roles: member.roles,
    joinedAt: member.createdAt,
    ...extras,
    teams: member.teamIds.flatMap((teamId) => {
      const team = teamFixtures.find((t) => t.id === teamId);
      if (!team) {
        return [];
      }
      const onTeam = everyone.filter((m) => m.teamIds.includes(teamId));
      return [
        {
          id: team.id,
          name: team.name,
          studentCount:
            STUDENT_COUNTS[teamId] ??
            onTeam.filter((m) => m.roles.includes("student")).length,
          coaches: onTeam
            .filter((m) => m.roles.includes("coach"))
            .sort((a, b) => a.user.name.localeCompare(b.user.name))
            .map((m) => ({ id: m.userId, name: m.user.name })),
        },
      ];
    }),
  };
}

function session(
  date: DateOnly,
  status: AttendanceSession["status"],
  detail: string
): AttendanceSession {
  return {
    id: `att-aline-${date}`,
    date,
    status,
    title: "U14 training",
    detail,
  };
}

/** Aline in November (8JO-0): present 4, late 1, absent 1, 83%. */
const ALINE_NOVEMBER: AttendanceSession[] = [
  session("2026-11-23", "present", "checked in 15:42 by QR"),
  session("2026-11-20", "present", "ticked by Coach Patrick"),
  session("2026-11-18", "excused", "told the coach ahead"),
  session("2026-11-13", "absent", "never checked in"),
  session("2026-11-09", "late", "checked in 16:12 by QR"),
  session("2026-11-04", "present", "checked in 15:55 by QR"),
  session("2026-11-02", "present", "checked in 15:50 by QR"),
];

const ALINE_OCTOBER: AttendanceSession[] = [
  session("2026-10-30", "present", "checked in 15:48 by QR"),
  session("2026-10-28", "present", "checked in 15:52 by QR"),
  session("2026-10-23", "absent", "never checked in"),
  session("2026-10-21", "present", "ticked by Coach Patrick"),
  session("2026-10-16", "present", "checked in 15:58 by QR"),
];

export async function getStudentAttendance(
  _academyId: Id,
  studentId: Id,
  params: { month: string }
): Promise<AttendanceMonth> {
  await fixtureDelay();
  let sessions: AttendanceSession[] = [];
  if (studentId === ALINE) {
    sessions = params.month === "2026-11" ? ALINE_NOVEMBER : ALINE_OCTOBER;
  }
  return { ...countAttendance(sessions), sessions };
}

function record(
  item: Partial<StudentRecordItem> &
    Pick<StudentRecordItem, "id" | "label" | "recordedOn" | "status">
): StudentRecordItem {
  return {
    recordType: "athletic",
    score: null,
    term: null,
    hasFile: false,
    recordedById: PATRICK,
    recordedByName: "Patrick Habimana",
    verifiedByName: null,
    ...item,
  };
}

const ALINE_RECORDS: StudentRecordItem[] = [
  record({
    id: "rec-aline-ft-8",
    label: "Free throws",
    score: "8 of 10",
    recordedOn: "2026-11-23",
    status: "pending",
  }),
  record({
    id: "rec-aline-report",
    recordType: "academic",
    label: "Report card",
    term: "first term",
    recordedOn: "2026-11-22",
    status: "pending",
    recordedById: ALINE,
    recordedByName: "Aline Uwase",
  }),
  record({
    id: "rec-aline-ft-7",
    label: "Free throws",
    score: "7 of 10",
    recordedOn: "2026-11-14",
    status: "verified",
    verifiedByName: "Sharika D.",
  }),
  record({
    id: "rec-aline-ft-6",
    label: "Free throws",
    score: "6 of 10",
    recordedOn: "2026-10-30",
    status: "verified",
    verifiedByName: "Sharika D.",
  }),
  record({
    id: "rec-aline-3pt",
    label: "3-pt shooting",
    score: "4 of 10",
    recordedOn: "2026-10-16",
    status: "verified",
    verifiedByName: "Patrick Habimana",
  }),
  record({
    id: "rec-aline-ft-5",
    label: "Free throws",
    score: "5 of 10",
    recordedOn: "2026-10-02",
    status: "verified",
    verifiedByName: "Patrick Habimana",
  }),
];

export async function getStudentRecords(
  _academyId: Id,
  studentId: Id
): Promise<StudentRecords> {
  await fixtureDelay();
  const items = studentId === ALINE ? ALINE_RECORDS : [];
  return { items, total: items.length };
}

export async function getStudentFees(
  _academyId: Id,
  studentId: Id,
  params: { scope: DetailScope }
): Promise<StudentFees> {
  await fixtureDelay();
  if (studentId !== ALINE) {
    return { unpaid: null, history: params.scope === "admin" ? [] : null };
  }
  return {
    unpaid: {
      amount: "30000",
      currency: "RWF",
      daysOverdue: 18,
      month: "2026-11-01",
    },
    history:
      params.scope === "admin"
        ? [
            {
              id: "fee-aline-oct",
              amount: "30000",
              currency: "RWF",
              method: "mobile_money",
              paidAt: "2026-10-04T09:00:00Z",
              periodStart: "2026-10-01",
            },
            {
              id: "fee-aline-sep",
              amount: "30000",
              currency: "RWF",
              method: "cash",
              paidAt: "2026-09-03T09:00:00Z",
              periodStart: "2026-09-01",
            },
          ]
        : null,
  };
}

const EMPTY_SUMMARY: CoachSummary = {
  sessionsRun: 0,
  tickedByHand: 0,
  attendanceRate: null,
  resultsLogged: 0,
  recentSessions: [],
  planned: null,
  cancelled: null,
  closedOnTime: null,
};

/** Patrick in November (DNS-0): 22 sessions, 1 left open, 41 by hand, 86%, 14 results. */
export async function getCoachSummary(
  _academyId: Id,
  coachId: Id,
  params: { month: string }
): Promise<CoachSummary> {
  await fixtureDelay();
  if (coachId !== PATRICK) {
    return EMPTY_SUMMARY;
  }
  if (params.month !== "2026-11") {
    return {
      sessionsRun: 26,
      closedOnTime: 26,
      planned: 27,
      cancelled: 1,
      tickedByHand: 37,
      attendanceRate: 0.84,
      resultsLogged: 17,
      recentSessions: [
        {
          key: "oct-31",
          date: "2026-10-31",
          title: "U16 match",
          detail: "4 ticked by hand, closed 12:35",
          status: "closed",
        },
        {
          key: "oct-30",
          date: "2026-10-30",
          title: "U14 training",
          detail: "2 ticked by hand, closed 18:02",
          status: "closed",
        },
        {
          key: "oct-28",
          date: "2026-10-28",
          title: "U14 training",
          detail: "1 ticked by hand, closed 18:10",
          status: "closed",
        },
      ],
    };
  }
  return {
    sessionsRun: 22,
    closedOnTime: 21,
    planned: 23,
    cancelled: 1,
    tickedByHand: 41,
    attendanceRate: 0.86,
    resultsLogged: 14,
    recentSessions: [
      {
        key: "nov-23",
        date: "2026-11-23",
        title: "U14 training",
        detail: "11 checked in so far",
        status: "live",
      },
      {
        key: "nov-21",
        date: "2026-11-21",
        title: "U16 match",
        detail: "2 ticked by hand, closed 12:40",
        status: "closed",
      },
      {
        key: "nov-20",
        date: "2026-11-20",
        title: "U14 training",
        detail: "3 ticked by hand, closed 18:05",
        status: "closed",
      },
    ],
  };
}

export async function getCoachRecords(
  _academyId: Id,
  coachId: Id,
  _params: { today: DateOnly }
): Promise<CoachRecords> {
  await fixtureDelay();
  if (coachId !== PATRICK) {
    return { groups: [], total: 0, pendingForThem: 0 };
  }
  return {
    total: 31,
    pendingForThem: 3,
    groups: [
      {
        key: "ft-nov-23",
        recordType: "athletic",
        status: "pending",
        title: "Free throws, 6 U14 students",
        detail: "Logged today. Jean Mugisha 8 of 10, Aline Uwase 8 of 10",
      },
      {
        key: "report-kevin",
        recordType: "academic",
        status: "verified",
        title: "Report card, Kevin Nshuti",
        detail: "Reviewed 10 Nov",
      },
      {
        key: "3pt-nov-12",
        recordType: "athletic",
        status: "verified",
        title: "3-pt shooting, 8 U16 students",
        detail: "Logged 12 Nov",
      },
    ],
  };
}

export async function moveStudent(input: MoveStudentInput): Promise<void> {
  await fixtureDelay();
  const member = findMember(input.academyId, input.userId);
  updateStoredMember(member.id, (m) => ({
    ...m,
    teamIds: input.toTeamId ? [input.toTeamId] : [],
  }));
}

export async function setCoachTeams(input: SetTeamsInput): Promise<void> {
  await fixtureDelay();
  const member = findMember(input.academyId, input.userId);
  updateStoredMember(member.id, (m) => ({
    ...m,
    teamIds: [
      ...m.teamIds.filter((t) => !input.remove.includes(t)),
      ...input.add.filter((t) => !m.teamIds.includes(t)),
    ],
  }));
}

export async function changeRole(input: ChangeRoleInput): Promise<void> {
  await fixtureDelay();
  const member = findMember(input.academyId, input.memberId);
  if (member.roles.includes("admin")) {
    throw apiError(403, OWNER_ONLY_MESSAGE);
  }
  if (input.role === "student" && member.teamIds.length > 1) {
    throw apiError(400, ONE_TEAM_MESSAGE);
  }
  updateStoredMember(member.id, (m) => ({ ...m, roles: [input.role] }));
}

export async function removeMember(input: {
  academyId: Id;
  memberId: Id;
}): Promise<void> {
  await fixtureDelay();
  const member = findMember(input.academyId, input.memberId);
  if (member.roles.includes("admin")) {
    throw apiError(403, OWNER_ONLY_MESSAGE);
  }
  updateStoredMember(member.id, () => null);
}

export async function removeFromTeam(input: {
  academyId: Id;
  teamId: Id;
  userId: Id;
}): Promise<void> {
  await fixtureDelay();
  const member = findMember(input.academyId, input.userId);
  updateStoredMember(member.id, (m) => ({
    ...m,
    teamIds: m.teamIds.filter((t) => t !== input.teamId),
  }));
}
