/**
 * A test "world": one academy with two teams and every role, plus a second
 * academy, and factories that create events, attendance, fees and records
 * over HTTP. Each test file builds its own world, so files never share rows.
 *
 * Academy A (default zone Pacific/Kiritimati, UTC+14):
 *   admin, coach + coach2 (team A), coachB (team B),
 *   student + student2 (team A), studentB (team B), studentFree (no team),
 *   outsider (signed in, member of nothing)
 * Academy B (Pacific/Pago_Pago, UTC-11): otherAdmin, otherStudent (team X),
 *   plus `dual`, a student in both academies (team A and team X).
 */
import { createHmac, randomUUID } from "node:crypto";

import { addDays, localNow, NEAR, openWindowTimes } from "./clock";
import { WEBHOOK_SECRET } from "./env";
import {
  type Body,
  call,
  describeReply,
  type Reply,
  signUp,
  type User,
} from "./http";
import { type SeededAcademy, seedAcademy, seedMember, seedTeam } from "./seed";

export const ZONE_FAR_EAST = "Pacific/Kiritimati";
export const ZONE_FAR_WEST = "Pacific/Pago_Pago";

export interface Academy extends SeededAcademy {
  /** `/api/v1/academies/:id` + rest. */
  path: (rest: string) => string;
}

export interface World {
  academy: Academy;
  admin: User;
  coach: User;
  coach2: User;
  coachB: User;
  dual: User;
  other: { academy: Academy; admin: User; student: User; teamX: string };
  outsider: User;
  student: User;
  student2: User;
  studentB: User;
  studentFree: User;
  teamA: string;
  teamB: string;
}

const toAcademy = (seeded: SeededAcademy): Academy => ({
  ...seeded,
  path: (rest) => `/api/v1/academies/${seeded.id}${rest}`,
});

export const buildWorld = async (
  options: { timezone?: string; otherTimezone?: string } = {}
): Promise<World> => {
  const academy = toAcademy(
    await seedAcademy({ timezone: options.timezone ?? ZONE_FAR_EAST })
  );
  const otherAcademy = toAcademy(
    await seedAcademy({ timezone: options.otherTimezone ?? ZONE_FAR_WEST })
  );
  const labels = [
    "admin",
    "coach",
    "coach2",
    "coachB",
    "student",
    "student2",
    "studentB",
    "studentFree",
    "outsider",
    "dual",
    "otherAdmin",
    "otherStudent",
  ] as const;
  const users = await Promise.all(labels.map((label) => signUp(label)));
  const by = Object.fromEntries(
    labels.map((label, index) => [label, users[index] as User])
  ) as Record<(typeof labels)[number], User>;

  const roles: [User, string][] = [
    [by.admin, "admin"],
    [by.coach, "coach"],
    [by.coach2, "coach"],
    [by.coachB, "coach"],
    [by.student, "student"],
    [by.student2, "student"],
    [by.studentB, "student"],
    [by.studentFree, "student"],
    [by.dual, "student"],
  ];
  for (const [user, role] of roles) {
    await seedMember(academy.id, user.id, role);
  }
  await seedMember(otherAcademy.id, by.otherAdmin.id, "admin");
  await seedMember(otherAcademy.id, by.otherStudent.id, "student");
  await seedMember(otherAcademy.id, by.dual.id, "student");

  const teamA = await seedTeam(academy.id, [
    by.coach.id,
    by.coach2.id,
    by.student.id,
    by.student2.id,
    by.dual.id,
  ]);
  const teamB = await seedTeam(academy.id, [by.coachB.id, by.studentB.id]);
  const teamX = await seedTeam(otherAcademy.id, [
    by.otherStudent.id,
    by.dual.id,
  ]);

  return {
    academy,
    admin: by.admin,
    coach: by.coach,
    coach2: by.coach2,
    coachB: by.coachB,
    student: by.student,
    student2: by.student2,
    studentB: by.studentB,
    studentFree: by.studentFree,
    outsider: by.outsider,
    dual: by.dual,
    teamA,
    teamB,
    other: {
      academy: otherAcademy,
      admin: by.otherAdmin,
      student: by.otherStudent,
      teamX,
    },
  };
};

/** Throws with the reply when the status is not the expected one. */
export const expectStatus = (reply: Reply, status: number): Body => {
  if (reply.status !== status) {
    throw new Error(`expected ${status}, got ${describeReply(reply)}`);
  }
  return reply.body;
};

export const todayIn = (academy: Academy): string =>
  localNow(academy.timezone).date;

// ---------------------------------------------------------------- events

export interface EventInput {
  collectAttendance?: boolean;
  endDate?: string | null;
  endTime?: string | null;
  eventType?: string;
  excludedDates?: string[];
  startDate?: string;
  startTime?: string | null;
  teamId?: string | null;
  title?: string;
}

export const createEvent = async (
  academy: Academy,
  by: User,
  input: EventInput = {}
): Promise<Body> => {
  const reply = await call("POST", academy.path("/events"), {
    user: by,
    body: {
      title: `Event ${randomUUID().slice(0, 6)}`,
      eventType: "training",
      startDate: todayIn(academy),
      ...input,
    },
  });
  return expectStatus(reply, 201).data;
};

/** A team (or academy-wide) event today whose check-in window is open now. */
export const createOpenEvent = (
  academy: Academy,
  by: User,
  teamId: string | null,
  input: EventInput = {}
): Promise<Body> =>
  createEvent(academy, by, {
    teamId,
    ...openWindowTimes(academy.timezone),
    collectAttendance: true,
    ...input,
  });

// ---------------------------------------------------------------- attendance

export const recordAttendance = async (
  academy: Academy,
  by: User,
  eventId: string,
  studentIds: readonly string[],
  options: { status?: string; sessionDate?: string } = {}
): Promise<Body[]> => {
  const reply = await call("POST", academy.path("/attendance"), {
    user: by,
    idempotencyKey: true,
    body: {
      eventId,
      sessionDate: options.sessionDate ?? todayIn(academy),
      entries: studentIds.map((studentId) => ({
        studentId,
        status: options.status ?? "present",
      })),
    },
  });
  return expectStatus(reply, 201).data;
};

export const getQrToken = async (academy: Academy, admin: User) => {
  const reply = await call("GET", academy.path("/academy-qr"), {
    user: admin,
  });
  const body = expectStatus(reply, 200);
  // GET answers `{ token, deepLink }` at the top level (API document shape);
  // regenerate wraps it in `data`. Accept either here; the shapes are
  // compared in transport.e2e.test.ts.
  return (body.data ?? body) as { token: string; deepLink: string };
};

export interface ScanInput {
  accuracyM?: number;
  action?: "check_in" | "check_out";
  eventId: string;
  isMocked?: boolean;
  latitude?: number;
  longitude?: number;
  sessionDate: string;
  token: string;
}

export const scan = (
  user: User,
  input: ScanInput,
  idempotencyKey: string | true = true
): Promise<Reply> =>
  call("POST", "/api/v1/attendance/scan", {
    user,
    idempotencyKey,
    body: {
      action: "check_in",
      latitude: NEAR.latitude,
      longitude: NEAR.longitude,
      accuracyM: 10,
      ...input,
    },
  });

// ---------------------------------------------------------------- fees

let periodCounter = Math.floor(Math.random() * 3000);

/** A one-day period no other fee in this run has used. */
export const nextPeriod = (): { periodStart: string; periodEnd: string } => {
  periodCounter += 1;
  const periodStart = addDays("2001-01-01", periodCounter);
  return { periodStart, periodEnd: periodStart };
};

export const feeBody = (
  studentId: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  studentId,
  description: "E2E tuition",
  ...nextPeriod(),
  amount: "15000.00",
  currency: "NGN",
  paidAt: new Date().toISOString(),
  ...overrides,
});

export const recordFee = async (
  academy: Academy,
  admin: User,
  studentId: string,
  overrides: Record<string, unknown> = {}
): Promise<Body> => {
  const reply = await call("POST", academy.path("/fees"), {
    user: admin,
    idempotencyKey: true,
    body: feeBody(studentId, overrides),
  });
  return expectStatus(reply, 201).data;
};

/** Sends a signed `payment.succeeded` to the generic provider. */
export const sendWebhook = (
  payload: unknown,
  options: { secret?: string; timestamp?: number; provider?: string } = {}
): Promise<Reply> => {
  const raw = JSON.stringify(payload);
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", options.secret ?? WEBHOOK_SECRET)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  return call(
    "POST",
    `/api/v1/webhooks/payments/${options.provider ?? "generic"}`,
    {
      rawBody: raw,
      headers: {
        "content-type": "application/json",
        "x-webhook-timestamp": timestamp,
        "x-webhook-signature": signature,
      },
    }
  );
};

export const paymentEvent = (input: {
  academyId: string;
  studentId: string;
  periodStart: string;
  periodEnd: string;
  reference?: string;
  amount?: string;
}) => ({
  type: "payment.succeeded",
  data: {
    reference: input.reference ?? `e2e-ref-${randomUUID()}`,
    amount: input.amount ?? "15000.00",
    currency: "NGN",
    paidAt: new Date().toISOString(),
    paymentMethod: "card",
    metadata: {
      academyId: input.academyId,
      studentId: input.studentId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    },
  },
});

// ---------------------------------------------------------------- records

export const academicData = () => ({
  template: "report_card",
  term: "First term",
  schoolYear: "2026/2027",
  subjects: [{ subject: "Maths", grade: "A1" }],
});

export const athleticData = () => ({
  template: "sprint_100m",
  timeSeconds: 12.34,
  timing: "hand",
});

export const recordBody = (
  academy: Academy,
  recordType: "academic" | "athletic"
) => ({
  recordType,
  recordedOn: todayIn(academy),
  schemaVersion: 1,
  data: recordType === "academic" ? academicData() : athleticData(),
});

export const createRecord = async (
  academy: Academy,
  by: User,
  studentId: string,
  recordType: "academic" | "athletic"
): Promise<Body> => {
  const reply = await call(
    "POST",
    academy.path(`/students/${studentId}/records`),
    { user: by, body: recordBody(academy, recordType) }
  );
  return expectStatus(reply, 201).data;
};

// ---------------------------------------------------------------- audit and pages

export const auditRows = async (
  academy: Academy,
  admin: User,
  query: Record<string, string>
): Promise<Body[]> => {
  const params = new URLSearchParams({ limit: "200", ...query });
  const reply = await call("GET", academy.path(`/audit-log?${params}`), {
    user: admin,
  });
  return expectStatus(reply, 200).data;
};

/** Follows nextCursor to the end; returns every page's items in order. */
export const walkPages = async (
  user: User,
  path: string,
  limit: number
): Promise<{ items: Body[]; pages: number }> => {
  const items: Body[] = [];
  let cursor: string | null = null;
  let pages = 0;
  const separator = path.includes("?") ? "&" : "?";
  do {
    const cursorPart: string = cursor
      ? `&cursor=${encodeURIComponent(cursor)}`
      : "";
    const reply = await call(
      "GET",
      `${path}${separator}limit=${limit}${cursorPart}`,
      { user }
    );
    const body = expectStatus(reply, 200);
    items.push(...body.data);
    cursor = body.nextCursor;
    pages += 1;
  } while (cursor && pages < 1000);
  return { items, pages };
};
