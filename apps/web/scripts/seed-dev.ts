/**
 * Dev seed: realistic data for trying the web app by hand against the local
 * database in apps/web/.env. Run from apps/web with `pnpm seed:dev`.
 *
 * What it makes (names follow the designs in src/features/fixtures.ts):
 * - a platform owner, the Hoops Genesis Kigali academy (Africa/Kigali, RWF)
 *   with teams U12, U14, U16 and Girls U16, and a small Bengaluru academy so
 *   the academy switcher has a second entry;
 * - one academy admin (who also coaches), three coaches and 20 students;
 * - training sessions for last week and this week, a live session today whose
 *   check-in window is open now, a match and a parents' meeting;
 * - attendance, fees (paid, unpaid, one voided and corrected), records
 *   (pending, verified, rejected), pending invitations and join codes.
 *
 * Re-running: users, academies, members and teams are kept (and put back to
 * their seeded roles and teams); everything time-relative (events,
 * attendance, fees, records, codes, pending invitations) is deleted and made
 * again for the current week. audit_log rows can never be deleted, so the
 * activity log keeps the entries of earlier runs.
 *
 * Writes that carry business rules go through the real /api/v1 handlers
 * in-process (with real session cookies), so validation and audit rows are
 * the same as in the app. Academies are created by the owner's
 * POST /api/v1/admin/academies handler; members and teams are written with
 * Prisma, the way the server's own membership code writes them.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: the seed runs its writes one at a time on purpose (deterministic order, readable errors)
import "varlock/auto-load";

import { randomUUID } from "node:crypto";

import { teamMembershipKey } from "@hoops-genesis/auth/membership-rules";

import type { ApiContext } from "@/server/api/handler";
import { todayInTimeZone, zonedDateTimeToUtc } from "@/server/api/time";
import { createAcademy } from "@/server/api/v1/admin-academies";
import {
  bulkVerifyAttendance,
  checkOutAttendance,
  createAttendance,
} from "@/server/api/v1/attendance";
import { createEvent } from "@/server/api/v1/events";
import { recordFee, voidFee } from "@/server/api/v1/fees";
import {
  createInvitationCode,
  revokeInvitationCode,
} from "@/server/api/v1/invitation-codes";
import {
  createStudentRecord,
  rejectRecord,
  verifyRecord,
} from "@/server/api/v1/records";
import { auth, db } from "@/services";

// ---------------------------------------------------------------- guard

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set; is apps/web/.env present?");
}
const databaseHost = new URL(databaseUrl).hostname;
if (!LOCAL_HOSTS.has(databaseHost)) {
  throw new Error(
    `seed-dev writes only to a local database, not ${databaseHost}`
  );
}

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3100";
const PASSWORD = "hoops-dev-1234";
const TIMEZONE = "Africa/Kigali";
const CURRENCY = "RWF";
const TUITION = "30000.00";
const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;
const DAYS_PER_WEEK = 7;
const CODE_DAYS = 30;
const LATE_MINUTES = 12;
const ON_TIME_MINUTES = 3;
const LIVE_LEAD_MINUTES = 20;
const LIVE_LENGTH_MINUTES = 90;
const MINUTES_PER_HOUR = 60;
const LAST_MINUTE_OF_DAY = 23 * MINUTES_PER_HOUR + 59;

// ---------------------------------------------------------------- people

type TeamKey = "u12" | "u14" | "u16" | "girlsU16";

interface PersonSpec {
  email: string;
  key: string;
  name: string;
}

interface StudentSpec extends PersonSpec {
  team: TeamKey | null;
}

const OWNER: PersonSpec = {
  key: "owner",
  email: "owner@example.com",
  name: "Innocent M.",
};

/** Academy admin in Kigali who also coaches three teams (as in the designs). */
const ADMIN: PersonSpec = {
  key: "admin",
  email: "admin@example.com",
  name: "Sharika D.",
};

const COACHES: (PersonSpec & { teams: TeamKey[] })[] = [
  {
    key: "coach",
    email: "coach@example.com",
    name: "Patrick Habimana",
    teams: ["u14", "u16"],
  },
  {
    key: "coach2",
    email: "coach2@example.com",
    name: "Marie Uwase",
    teams: ["girlsU16"],
  },
  {
    key: "coach3",
    email: "coach3@example.com",
    name: "Jean-Paul Nkurunziza",
    teams: ["u12"],
  },
];

const ADMIN_TEAMS: TeamKey[] = ["u12", "u14", "u16"];

const STUDENTS: StudentSpec[] = [
  ["Aline Uwase", "u14"],
  ["Jean Mugisha", "u14"],
  ["Eric Niyonzima", null],
  ["Samuel Iradukunda", "u16"],
  ["Grace Ishimwe", "girlsU16"],
  ["Divine Ingabire", "u12"],
  ["Samuel Mugabo", "u16"],
  ["Olivia Uwimana", "u12"],
  ["Kevin Nshuti", "u14"],
  ["Divine Niyonsaba", "u14"],
  ["Olivier Kamanzi", "u14"],
  ["Mercy Gatete", "u12"],
  ["Keza Nyiraneza", "u12"],
  ["Brian Manzi", "u12"],
  ["Ange Kamikazi", "u12"],
  ["Claudine Mukamana", "girlsU16"],
  ["Diane Uwera", "girlsU16"],
  ["Esther Ingabire", "girlsU16"],
  ["Fabrice Habineza", "u16"],
  ["Yves Mugenzi", "u16"],
].map(([name, team], index) => ({
  key: index === 0 ? "student" : `student${index + 1}`,
  email:
    index === 0 ? "student@example.com" : `student${index + 1}@example.com`,
  name: name as string,
  team: team as TeamKey | null,
}));

const TEAMS: { key: TeamKey; name: string; ageGroup: string }[] = [
  { key: "u12", name: "U12", ageGroup: "U12" },
  { key: "u14", name: "U14", ageGroup: "U14" },
  { key: "u16", name: "U16", ageGroup: "U16" },
  { key: "girlsU16", name: "Girls U16", ageGroup: "U16" },
];

/** Training weekdays per team (0 = Monday) and the usual start/end time. */
const TRAINING: Record<
  TeamKey,
  { days: number[]; start: string; end: string }
> = {
  u12: { days: [0, 2, 4], start: "15:30", end: "17:00" },
  u14: { days: [0, 1, 3, 5], start: "16:00", end: "17:30" },
  u16: { days: [1, 3, 5], start: "17:00", end: "18:30" },
  girlsU16: { days: [0, 2, 4], start: "17:30", end: "19:00" },
};

const KIGALI = {
  name: "Hoops Genesis Kigali",
  slug: "hoops-genesis-kigali",
  timezone: TIMEZONE,
  defaultCurrency: CURRENCY,
  latitude: -1.9441,
  longitude: 30.0619,
  attendanceRadiusM: 150,
  location: "KG 9 Ave, Kigali",
};

const BENGALURU = {
  name: "Hoops Genesis Bengaluru",
  slug: "hoops-genesis-bengaluru",
  timezone: "Asia/Kolkata",
  defaultCurrency: "INR",
  latitude: 12.9784,
  longitude: 77.6408,
  attendanceRadiusM: 150,
  location: "Indiranagar, Bengaluru",
};

// ---------------------------------------------------------------- helpers

interface SeedUser extends PersonSpec {
  cookie: string;
  id: string;
}

const toCookieHeader = (headers: Headers): string =>
  headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

/** Signs up (first run) or reuses the account, then signs in for a cookie. */
const ensureUser = async (
  spec: PersonSpec,
  platformRole: "admin" | "user"
): Promise<SeedUser> => {
  const existing = await db.user.findUnique({
    where: { email: spec.email },
    select: { id: true },
  });
  if (!existing) {
    await auth.api.signUpEmail({
      body: { email: spec.email, password: PASSWORD, name: spec.name },
    });
  }
  const user = await db.user.update({
    where: { email: spec.email },
    // Undo what a manual test may have changed (ban, role).
    data: {
      role: platformRole,
      banned: false,
      banReason: null,
      banExpires: null,
    },
    select: { id: true },
  });
  const { headers } = await auth.api.signInEmail({
    body: { email: spec.email, password: PASSWORD },
    returnHeaders: true,
  });
  return { ...spec, id: user.id, cookie: toCookieHeader(headers) };
};

type Handler = (ctx: ApiContext) => Promise<Response>;

/** Calls an /api/v1 handler in-process as `user`; throws unless 2xx. */
const callApi = async (
  handler: Handler,
  options: {
    path: string;
    user: SeedUser;
    method?: string;
    body?: unknown;
    params?: Record<string, string>;
    idempotent?: boolean;
  }
  // biome-ignore lint/suspicious/noExplicitAny: response bodies vary per handler
): Promise<any> => {
  const headers = new Headers({ cookie: options.user.cookie });
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (options.idempotent) {
    headers.set("idempotency-key", randomUUID());
  }
  const request = new Request(`${BASE_URL}${options.path}`, {
    method: options.method ?? "POST",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const response = await handler({ request, params: options.params ?? {} });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${options.method ?? "POST"} ${options.path} as ${options.user.email}: ${response.status} ${text}`
    );
  }
  return text ? JSON.parse(text) : null;
};

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);

/** Monday of the week that holds `date` (dates are YYYY-MM-DD). */
const mondayOf = (date: string): string => {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const fromMonday = (weekday + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  return addDays(date, -fromMonday);
};

const pad = (value: number): string => String(value).padStart(2, "0");

const minutesToTime = (minutes: number): string =>
  `${pad(Math.floor(minutes / MINUTES_PER_HOUR))}:${pad(minutes % MINUTES_PER_HOUR)}`;

/** Local wall-clock minutes since midnight in the academy zone. */
const localMinutesNow = (timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return read("hour") * MINUTES_PER_HOUR + read("minute");
};

const at = (date: string, time: string, plusMinutes = 0): string =>
  new Date(
    zonedDateTimeToUtc(date, time, TIMEZONE).getTime() +
      plusMinutes * MS_PER_MINUTE
  ).toISOString();

// ---------------------------------------------------------------- academies

const ensureAcademy = async (
  owner: SeedUser,
  fields: typeof KIGALI,
  firstAdmin: SeedUser
): Promise<string> => {
  const existing = await db.organization.findUnique({
    where: { slug: fields.slug },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }
  const body = await callApi(createAcademy, {
    path: "/api/v1/admin/academies",
    user: owner,
    body: { ...fields, firstAdmin: { userId: firstAdmin.id } },
  });
  return body.data.id as string;
};

const ensureMember = async (
  academyId: string,
  userId: string,
  role: string
): Promise<void> => {
  await db.member.upsert({
    where: { organizationId_userId: { organizationId: academyId, userId } },
    update: { role },
    create: {
      id: randomUUID(),
      organizationId: academyId,
      userId,
      role,
      createdAt: new Date(),
    },
  });
};

const ensureTeams = async (
  academyId: string
): Promise<Record<TeamKey, string>> => {
  const ids = {} as Record<TeamKey, string>;
  for (const team of TEAMS) {
    const existing = await db.team.findFirst({
      where: { organizationId: academyId, name: team.name },
      select: { id: true },
    });
    ids[team.key] =
      existing?.id ??
      (
        await db.team.create({
          data: {
            id: randomUUID(),
            name: team.name,
            ageGroup: team.ageGroup,
            organizationId: academyId,
            createdAt: new Date(),
          },
          select: { id: true },
        })
      ).id;
  }
  return ids;
};

/** Puts each seeded person on exactly their seeded teams, then fixes counts. */
const placeOnTeams = async (
  academyId: string,
  placements: { userId: string; teamIds: string[] }[]
): Promise<void> => {
  const userIds = placements.map((placement) => placement.userId);
  await db.teamMember.deleteMany({
    where: { userId: { in: userIds }, team: { organizationId: academyId } },
  });
  await db.teamMember.createMany({
    data: placements.flatMap(({ userId, teamIds }) =>
      teamIds.map((teamId) => ({
        id: randomUUID(),
        teamId,
        userId,
        membershipKey: teamMembershipKey(teamId, userId),
        createdAt: new Date(),
      }))
    ),
  });
  const teams = await db.team.findMany({
    where: { organizationId: academyId },
    select: { id: true, _count: { select: { teammembers: true } } },
  });
  for (const team of teams) {
    await db.team.update({
      where: { id: team.id },
      data: { memberCount: team._count.teammembers },
    });
  }
};

/** Deletes the time-relative rows of an earlier run (never audit_log). */
const resetAcademyData = async (
  academyId: string,
  userIds: string[]
): Promise<void> => {
  await db.attendance.deleteMany({ where: { academyId } });
  await db.calendarEvent.deleteMany({ where: { academyId } });
  await db.fee.deleteMany({ where: { academyId } });
  await db.studentRecord.deleteMany({ where: { academyId } });
  await db.invitationCode.deleteMany({ where: { academyId } });
  await db.invitation.deleteMany({
    where: { organizationId: academyId, status: "pending" },
  });
  await db.idempotencyKey.deleteMany({
    where: { OR: userIds.map((id) => ({ scope: { startsWith: `${id} ` } })) },
  });
};

// ---------------------------------------------------------------- main

interface Seeded {
  attendance: number;
  codes: string[];
  events: number;
  fees: { paid: number; voided: number };
  invitations: string[];
  liveEventId: string;
  records: { pending: number; verified: number; rejected: number };
}

const seedEvents = async (input: {
  academyId: string;
  admin: SeedUser;
  coachFor: Record<TeamKey, SeedUser>;
  teamIds: Record<TeamKey, string>;
  today: string;
}) => {
  const { academyId, admin, coachFor, teamIds, today } = input;
  const path = `/api/v1/academies/${academyId}/events`;
  const params = { academyId };
  const lastMonday = addDays(mondayOf(today), -DAYS_PER_WEEK);
  /** Past training sessions (for attendance), keyed by team. */
  const pastSessions: { team: TeamKey; eventId: string; date: string }[] = [];
  let count = 0;

  for (const team of TEAMS) {
    const plan = TRAINING[team.key];
    for (let offset = 0; offset < 2 * DAYS_PER_WEEK; offset += 1) {
      const date = addDays(lastMonday, offset);
      const isTrainingDay = plan.days.includes(offset % DAYS_PER_WEEK);
      // Today's U12 and U14 sessions are the live ones below.
      const isLiveToday =
        date === today && (team.key === "u14" || team.key === "u12");
      if (!isTrainingDay || isLiveToday) {
        continue;
      }
      const body = await callApi(createEvent, {
        path,
        params,
        user: coachFor[team.key],
        body: {
          title: `${team.name} training`,
          eventType: "training",
          startDate: date,
          startTime: plan.start,
          endTime: plan.end,
          teamId: teamIds[team.key],
          location: "Main court",
          collectAttendance: true,
        },
      });
      count += 1;
      if (date < today) {
        pastSessions.push({ team: team.key, eventId: body.data.id, date });
      }
    }
  }

  // Live today: the check-in window (30 min before start .. 60 min after end)
  // is open whenever the seed runs.
  const nowMinutes = localMinutesNow(TIMEZONE);
  const startMinutes = Math.max(0, nowMinutes - LIVE_LEAD_MINUTES);
  const endMinutes = Math.min(
    LAST_MINUTE_OF_DAY,
    startMinutes + LIVE_LENGTH_MINUTES
  );
  const liveTimes = {
    startTime: minutesToTime(startMinutes),
    endTime: minutesToTime(endMinutes),
  };
  const live = await callApi(createEvent, {
    path,
    params,
    user: coachFor.u14,
    body: {
      title: "U14 training",
      eventType: "training",
      startDate: today,
      ...liveTimes,
      teamId: teamIds.u14,
      location: "Main court",
      collectAttendance: true,
    },
  });
  const liveU12 = await callApi(createEvent, {
    path,
    params,
    user: coachFor.u12,
    body: {
      title: "U12 training",
      eventType: "training",
      startDate: today,
      ...liveTimes,
      teamId: teamIds.u12,
      location: "Court 2",
      collectAttendance: true,
    },
  });
  count += 2;

  const saturday = addDays(mondayOf(today), 5);
  await callApi(createEvent, {
    path,
    params,
    user: coachFor.u16,
    body: {
      title: "U16 vs APR Juniors",
      eventType: "match",
      startDate: saturday,
      startTime: "10:00",
      endTime: "12:00",
      teamId: teamIds.u16,
      location: "Amahoro Indoor Arena",
      description: "League match. Be at the arena by 09:15.",
      collectAttendance: true,
    },
  });
  await callApi(createEvent, {
    path,
    params,
    user: admin,
    body: {
      title: "Parents' meeting",
      eventType: "meeting",
      startDate: saturday,
      startTime: "14:00",
      endTime: "15:30",
      location: "Clubhouse",
      description: "Term plan, fees and the December camp.",
    },
  });
  await callApi(createEvent, {
    path,
    params,
    user: admin,
    body: {
      title: "December holiday camp",
      eventType: "camp",
      startDate: addDays(mondayOf(today), 2 * DAYS_PER_WEEK),
      endDate: addDays(mondayOf(today), 2 * DAYS_PER_WEEK + 4),
      startTime: "09:00",
      endTime: "13:00",
      location: "Main court",
      collectAttendance: true,
    },
  });
  count += 3;

  return {
    count,
    pastSessions,
    liveEventId: live.data.id as string,
    liveU12EventId: liveU12.data.id as string,
  };
};

const STATUS_CYCLE = ["present", "present", "late", "present", "absent"];

const seedAttendance = async (input: {
  academyId: string;
  admin: SeedUser;
  coachFor: Record<TeamKey, SeedUser>;
  rosters: Record<TeamKey, SeedUser[]>;
  pastSessions: { team: TeamKey; eventId: string; date: string }[];
  liveEventId: string;
  today: string;
}): Promise<number> => {
  const { academyId, admin, coachFor, rosters, pastSessions } = input;
  const path = `/api/v1/academies/${academyId}/attendance`;
  const params = { academyId };
  let rows = 0;
  let toVerify: string[] = [];
  let checkOutId: string | null = null;

  for (const [sessionIndex, session] of pastSessions.entries()) {
    const roster = rosters[session.team];
    if (roster.length === 0) {
      continue;
    }
    const { start } = TRAINING[session.team];
    const entries = roster.map((student, index) => {
      const status =
        STATUS_CYCLE[(index + sessionIndex) % STATUS_CYCLE.length] ?? "present";
      if (status === "absent") {
        return { studentId: student.id, status };
      }
      const minutes = status === "late" ? LATE_MINUTES : -ON_TIME_MINUTES;
      return {
        studentId: student.id,
        status,
        checkInAt: at(session.date, start, minutes),
      };
    });
    const body = await callApi(createAttendance, {
      path,
      params,
      user: coachFor[session.team],
      body: { eventId: session.eventId, sessionDate: session.date, entries },
      idempotent: true,
    });
    const created = body.data as { id: string; status: string }[];
    rows += created.length;
    // Coaches ticked most of last week's sessions.
    if (sessionIndex % 2 === 0) {
      toVerify = [
        ...toVerify,
        ...created
          .filter((row) => row.status !== "absent")
          .map((row) => row.id),
      ];
    }
    checkOutId ??= created.find((row) => row.status === "present")?.id ?? null;
  }

  if (toVerify.length > 0) {
    await callApi(bulkVerifyAttendance, {
      path: `${path}/verify`,
      params,
      user: admin,
      body: { ids: toVerify },
    });
  }
  if (checkOutId) {
    await callApi(checkOutAttendance, {
      path: `${path}/${checkOutId}/check-out`,
      params: { academyId, id: checkOutId },
      user: admin,
      body: {},
    });
  }

  // The live U14 session: two arrivals so far, one already ticked.
  const [first, second] = input.rosters.u14;
  if (first && second) {
    const now = Date.now();
    const live = await callApi(createAttendance, {
      path,
      params,
      user: coachFor.u14,
      body: {
        eventId: input.liveEventId,
        sessionDate: input.today,
        entries: [
          {
            studentId: first.id,
            status: "present",
            checkInAt: new Date(now - 6 * MS_PER_MINUTE).toISOString(),
          },
          {
            studentId: second.id,
            status: "present",
            checkInAt: new Date(now - 2 * MS_PER_MINUTE).toISOString(),
          },
        ],
      },
      idempotent: true,
    });
    const liveRows = live.data as { id: string }[];
    rows += liveRows.length;
    const [tick] = liveRows;
    if (tick) {
      await callApi(bulkVerifyAttendance, {
        path: `${path}/verify`,
        params,
        user: coachFor.u14,
        body: { ids: [tick.id] },
      });
    }
  }
  return rows;
};

const monthPeriod = (date: string) => {
  const [year, month] = date.split("-").map(Number) as [number, number];
  const start = `${year}-${pad(month)}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    periodStart: start,
    periodEnd: `${year}-${pad(month)}-${pad(lastDay)}`,
    label: new Intl.DateTimeFormat("en-GB", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${start}T00:00:00Z`)),
  };
};

const PAYMENT_METHODS = ["cash", "mobile_money", "bank_transfer"] as const;

const seedFees = async (input: {
  academyId: string;
  admin: SeedUser;
  students: SeedUser[];
  today: string;
}) => {
  const { academyId, admin, students, today } = input;
  const path = `/api/v1/academies/${academyId}/fees`;
  const params = { academyId };
  const current = monthPeriod(today);
  const previous = monthPeriod(addDays(current.periodStart, -1));
  let paid = 0;

  const pay = async (
    student: SeedUser,
    period: ReturnType<typeof monthPeriod>,
    index: number,
    amount = TUITION
  ) => {
    const method = PAYMENT_METHODS[index % PAYMENT_METHODS.length] ?? "cash";
    // Paid on the 2nd to 6th of the period, never in the future.
    const paidOn = addDays(period.periodStart, 1 + (index % 5));
    const paidDate = paidOn > today ? today : paidOn;
    const body = await callApi(recordFee, {
      path,
      params,
      user: admin,
      idempotent: true,
      body: {
        studentId: student.id,
        description: `${period.label} tuition`,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        dueDate: addDays(period.periodStart, 4),
        amount,
        currency: CURRENCY,
        paidAt: new Date(
          Math.min(Date.now(), Date.parse(at(paidDate, "09:00", index * 7)))
        ).toISOString(),
        paymentMethod: method,
        ...(method === "cash"
          ? {}
          : {
              paymentReference: `DEV-${randomUUID().slice(0, 8).toUpperCase()}`,
            }),
      },
    });
    paid += 1;
    return body.data as { id: string };
  };

  // Last month: everyone on a team paid but two.
  for (const [index, student] of students.entries()) {
    if (index % 9 !== 4) {
      await pay(student, previous, index);
    }
  }
  // This month: about two thirds have paid; the rest show as unpaid.
  for (const [index, student] of students.entries()) {
    if (index % 3 !== 2 && index !== 1) {
      await pay(student, current, index);
    }
  }
  // A correction: wrong amount recorded, voided, then recorded again.
  const [, corrected] = students;
  if (corrected) {
    const wrong = await pay(corrected, current, 1, "3000.00");
    await callApi(voidFee, {
      path: `${path}/${wrong.id}/void`,
      params: { academyId, id: wrong.id },
      user: admin,
      body: { reason: "Wrong amount: 3,000 typed instead of 30,000" },
    });
    await pay(corrected, current, 1);
  }
  return { paid: paid - 1, voided: 1 };
};

const seedRecords = async (input: {
  academyId: string;
  admin: SeedUser;
  coach: SeedUser;
  coachU12: SeedUser;
  rosters: Record<TeamKey, SeedUser[]>;
  today: string;
}) => {
  const { academyId, admin, coach, coachU12, rosters, today } = input;
  const counts = { pending: 0, verified: 0, rejected: 0 };
  const create = async (
    by: SeedUser,
    student: SeedUser,
    recordType: "academic" | "athletic",
    data: Record<string, unknown>,
    daysAgo: number
  ): Promise<string> => {
    const body = await callApi(createStudentRecord, {
      path: `/api/v1/academies/${academyId}/students/${student.id}/records`,
      params: { academyId, studentId: student.id },
      user: by,
      body: {
        recordType,
        recordedOn: addDays(today, -daysAgo),
        schemaVersion: 1,
        data,
      },
    });
    return body.data.id as string;
  };
  const review = async (
    by: SeedUser,
    id: string,
    decision: "verify" | "reject",
    reason?: string
  ) => {
    await callApi(decision === "verify" ? verifyRecord : rejectRecord, {
      path: `/api/v1/academies/${academyId}/records/${id}/${decision}`,
      params: { academyId, id },
      user: by,
      body: decision === "verify" ? {} : { reason },
    });
  };
  const sprint = (timeSeconds: number) => ({
    template: "sprint_100m",
    timeSeconds,
    timing: "hand",
  });
  const reportCard = (school: string, averageScore: number) => ({
    template: "report_card",
    schoolName: school,
    term: "First term",
    schoolYear: "2026/2027",
    subjects: [
      { subject: "Mathematics", grade: "A", score: averageScore + 4 },
      { subject: "English", grade: "B+", score: averageScore - 3 },
      { subject: "Physics", grade: "B", score: averageScore - 1 },
    ],
    averageScore,
  });

  const [aline, jean, kevin, divine, olivier] = rosters.u14;
  const [u12First, u12Second] = rosters.u12;
  // Athletic: sprint times by the U14 coach; the admin reviews them.
  if (aline && jean && kevin && divine && olivier) {
    const alineTimes = [14.2, 13.9, 13.6];
    for (const [index, time] of alineTimes.entries()) {
      const id = await create(
        coach,
        aline,
        "athletic",
        sprint(time),
        28 - index * 10
      );
      await review(admin, id, "verify");
      counts.verified += 1;
    }
    await create(coach, jean, "athletic", sprint(13.4), 1);
    await create(coach, kevin, "athletic", sprint(14.8), 0);
    counts.pending += 2;
    const rejected = await create(coach, divine, "athletic", sprint(11.1), 2);
    await review(
      admin,
      rejected,
      "reject",
      "11.1 s looks like a typo; please re-time on Thursday"
    );
    counts.rejected += 1;
    // Academic: students upload their own report cards.
    await create(
      aline,
      aline,
      "academic",
      reportCard("Lycée de Kigali", 78),
      3
    );
    counts.pending += 1;
    const verified = await create(
      jean,
      jean,
      "academic",
      reportCard("Kigali Parents School", 71),
      12
    );
    await review(coach, verified, "verify");
    counts.verified += 1;
    const blurry = await create(
      olivier,
      olivier,
      "academic",
      reportCard("Green Hills Academy", 65),
      5
    );
    await review(
      coach,
      blurry,
      "reject",
      "The grades don't match the school's report; please upload the stamped copy"
    );
    counts.rejected += 1;
  }
  if (u12First && u12Second) {
    await create(coachU12, u12First, "athletic", sprint(16.3), 1);
    await create(
      u12Second,
      u12Second,
      "academic",
      reportCard("Kigali Parents School", 82),
      2
    );
    counts.pending += 2;
  }
  return counts;
};

const seedInvitations = async (
  academyId: string,
  admin: SeedUser,
  teamIds: Record<TeamKey, string>
): Promise<string[]> => {
  const invites = [
    { email: "new.coach@example.com", role: "coach" as const },
    {
      email: "new.student@example.com",
      role: "student" as const,
      teamId: teamIds.u12,
    },
  ];
  for (const invite of invites) {
    await auth.api.createInvitation({
      headers: new Headers({ cookie: admin.cookie }),
      body: { ...invite, organizationId: academyId },
    });
  }
  return invites.map((invite) => `${invite.email} (${invite.role})`);
};

const seedCodes = async (
  academyId: string,
  admin: SeedUser,
  teamIds: Record<TeamKey, string>
): Promise<string[]> => {
  const path = `/api/v1/academies/${academyId}/invitation-codes`;
  const params = { academyId };
  const expiresAt = new Date(Date.now() + CODE_DAYS * MS_PER_DAY).toISOString();
  const make = async (body: Record<string, unknown>) =>
    (await callApi(createInvitationCode, { path, params, user: admin, body }))
      .data as { id: string; code: string };
  const u14 = await make({
    role: "student",
    teamId: teamIds.u14,
    maxUses: 20,
    expiresAt,
  });
  const girls = await make({ role: "student", teamId: teamIds.girlsU16 });
  const coach = await make({ role: "coach" });
  const revoked = await make({ role: "student", teamId: teamIds.u12 });
  await callApi(revokeInvitationCode, {
    path: `${path}/${revoked.id}/revoke`,
    params: { academyId, id: revoked.id },
    user: admin,
    body: { reason: "Shared in the wrong WhatsApp group" },
  });
  return [
    `${u14.code} student U14, 20 uses, ${CODE_DAYS} days`,
    `${girls.code} student Girls U16, single use, 7 days`,
    `${coach.code} coach, single use, 7 days`,
    `${revoked.code} student U12 (revoked)`,
  ];
};

const main = async (): Promise<Seeded & { academyId: string }> => {
  const owner = await ensureUser(OWNER, "admin");
  const admin = await ensureUser(ADMIN, "user");
  const coaches = await Promise.all(
    COACHES.map((spec) => ensureUser(spec, "user"))
  );
  const students: SeedUser[] = [];
  for (const spec of STUDENTS) {
    students.push(await ensureUser(spec, "user"));
  }

  const academyId = await ensureAcademy(owner, KIGALI, admin);
  const bengaluruId = await ensureAcademy(owner, BENGALURU, admin);
  await ensureMember(bengaluruId, admin.id, "admin");
  await ensureMember(academyId, admin.id, "admin,coach");
  for (const coach of coaches) {
    await ensureMember(academyId, coach.id, "coach");
  }
  for (const student of students) {
    await ensureMember(academyId, student.id, "student");
  }

  const teamIds = await ensureTeams(academyId);
  const placements = [
    { userId: admin.id, teamIds: ADMIN_TEAMS.map((key) => teamIds[key]) },
    ...COACHES.map((spec, index) => ({
      userId: coaches[index]?.id ?? "",
      teamIds: spec.teams.map((key) => teamIds[key]),
    })),
    ...STUDENTS.map((spec, index) => ({
      userId: students[index]?.id ?? "",
      teamIds: spec.team ? [teamIds[spec.team]] : [],
    })),
  ];
  await placeOnTeams(academyId, placements);

  const allUsers = [owner, admin, ...coaches, ...students];
  await resetAcademyData(
    academyId,
    allUsers.map((user) => user.id)
  );
  await resetAcademyData(bengaluruId, []);

  const coachFor = {} as Record<TeamKey, SeedUser>;
  for (const [index, spec] of COACHES.entries()) {
    for (const team of spec.teams) {
      coachFor[team] = coaches[index] as SeedUser;
    }
  }
  const rosters = {} as Record<TeamKey, SeedUser[]>;
  for (const team of TEAMS) {
    rosters[team.key] = students.filter(
      (_, index) => STUDENTS[index]?.team === team.key
    );
  }

  const today = todayInTimeZone(TIMEZONE);
  const events = await seedEvents({
    academyId,
    admin,
    coachFor,
    teamIds,
    today,
  });
  const attendance = await seedAttendance({
    academyId,
    admin,
    coachFor,
    rosters,
    pastSessions: events.pastSessions,
    liveEventId: events.liveEventId,
    today,
  });
  const onATeam = students.filter((_, index) => STUDENTS[index]?.team);
  const fees = await seedFees({ academyId, admin, students: onATeam, today });
  const records = await seedRecords({
    academyId,
    admin,
    coach: coachFor.u14,
    coachU12: coachFor.u12,
    rosters,
    today,
  });
  const invitations = await seedInvitations(academyId, admin, teamIds);
  const codes = await seedCodes(academyId, admin, teamIds);

  return {
    academyId,
    attendance,
    codes,
    events: events.count,
    fees,
    invitations,
    liveEventId: events.liveEventId,
    records,
  };
};

const teamName = (key: TeamKey): string =>
  TEAMS.find((team) => team.key === key)?.name ?? key;

const printSummary = (seeded: Awaited<ReturnType<typeof main>>): void => {
  const lines = [
    "",
    "Dev seed done.",
    `Academy: ${KIGALI.name} (${seeded.academyId}), plus ${BENGALURU.name}`,
    `Events: ${seeded.events} (live U14 session today: ${seeded.liveEventId})`,
    `Attendance rows: ${seeded.attendance}`,
    `Fees: ${seeded.fees.paid} paid, ${seeded.fees.voided} voided`,
    `Records: ${seeded.records.pending} pending, ${seeded.records.verified} verified, ${seeded.records.rejected} rejected`,
    `Pending invitations: ${seeded.invitations.join(", ")}`,
    "Join codes:",
    ...seeded.codes.map((code) => `  ${code}`),
    "",
    `Logins (password for all: ${PASSWORD}):`,
    `  ${OWNER.email.padEnd(26)} ${OWNER.name}, platform owner`,
    `  ${ADMIN.email.padEnd(26)} ${ADMIN.name}, Kigali admin + coach (U12, U14, U16); Bengaluru admin`,
    ...COACHES.map(
      (coach) =>
        `  ${coach.email.padEnd(26)} ${coach.name}, coach (${coach.teams.map(teamName).join(", ")})`
    ),
    ...STUDENTS.map(
      (student) =>
        `  ${student.email.padEnd(26)} ${student.name}, student (${student.team ? teamName(student.team) : "no team"})`
    ),
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
};

try {
  printSummary(await main());
} finally {
  await db.$disconnect();
}
