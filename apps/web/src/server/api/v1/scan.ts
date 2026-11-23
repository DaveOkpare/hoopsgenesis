/**
 * POST /api/v1/attendance/scan   signed-in student; Idempotency-Key required
 *
 * Body: { token, eventId, sessionDate, action: "check_in" | "check_out",
 *         latitude, longitude, accuracyM, isMocked? }
 *
 * The academy comes from the QR token, the session from eventId +
 * sessionDate, the student from the session cookie. Checks run in the API
 * document's order, all inside one transaction:
 *
 *   token signature + current qrNonce                     401 invalid_code
 *   event in that academy, collect_attendance, a session
 *     of the event, and today in the academy's time zone  404 session_not_found
 *   now inside the session window                         403 outside_window
 *   student member of the academy, on the event's team    403 not_on_team
 *     (details: teamId, teamName, ageGroup: "This session is for U14")
 *   isMocked is not true                                  403 mock_location
 *   accuracyM <= 100                                      422 location_imprecise
 *   distance <= attendanceRadiusM                         403 too_far (details.distanceM)
 *   check_in:  live row exists                            409 already_checked_in
 *              else insert 'present'                      201 checked_in
 *   check_out: no row, absent, or no check-in             409 not_checked_in
 *              check-out already set                      409 already_checked_out
 *              else set check_out_at + audit_log          200 checked_out
 *
 * Only distances are stored; coordinates never reach the database, audit
 * rows or logs.
 */
import { Prisma, type TransactionClient } from "@hoops-genesis/db/prisma";
import { z } from "zod";

import { authenticate } from "../access";
import { writeAuditLog } from "../audit";
import {
  ApiError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RuleViolationError,
} from "../errors";
import { apiHandler } from "../handler";
import { withIdempotency } from "../idempotency";
import { isStudentOfAcademy, isUserOnTeam } from "../scope";
import { fromPlainDate, toEventDates } from "../serialize";
import {
  haversineDistanceM,
  isSessionDate,
  isWithinWindow,
  todayInTimeZone,
} from "../time";
import {
  idSchema,
  isoDateSchema,
  parseBody,
  readJsonBody,
} from "../validation";
import { isAcademyQrSignatureValid, parseAcademyQrToken } from "./academy-qr";
import {
  type AttendanceRow,
  attendanceClock,
  findEventForAttendanceWrite,
  getSessionWindow,
  serializeAttendanceRow,
} from "./attendance-shared";

/** Worst reported GPS accuracy accepted, in metres. */
export const MAX_ACCURACY_M = 100;
const DEFAULT_ATTENDANCE_RADIUS_M = 150;
const MAX_TOKEN_LENGTH = 1024;
const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;
const MAX_REPORTED_ACCURACY_M = 100_000;
const HTTP_CREATED = 201;
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;

const scanSchema = z.object({
  token: z.string().trim().min(1).max(MAX_TOKEN_LENGTH),
  eventId: idSchema,
  sessionDate: isoDateSchema,
  action: z.enum(["check_in", "check_out"]),
  latitude: z.number().min(-MAX_LATITUDE).max(MAX_LATITUDE),
  longitude: z.number().min(-MAX_LONGITUDE).max(MAX_LONGITUDE),
  accuracyM: z.number().min(0).max(MAX_REPORTED_ACCURACY_M),
  isMocked: z.boolean().optional(),
});

type ScanInput = z.output<typeof scanSchema>;

interface ScanAcademy {
  attendanceRadiusM: number;
  id: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

const invalidCode = (): ApiError =>
  new ApiError(
    HTTP_UNAUTHORIZED,
    "invalid_code",
    "This isn't your academy's current code"
  );

/** Step 1: the token is signed for an academy and its current qrNonce. */
const verifyToken = async (
  tx: TransactionClient,
  token: string
): Promise<ScanAcademy> => {
  const parsed = parseAcademyQrToken(token);
  if (!parsed) {
    throw invalidCode();
  }
  const academy = await tx.organization.findUnique({
    where: { id: parsed.academyId },
    select: {
      id: true,
      timezone: true,
      latitude: true,
      longitude: true,
      attendanceRadiusM: true,
      qrNonce: true,
    },
  });
  if (!(academy && isAcademyQrSignatureValid(parsed, academy.qrNonce))) {
    throw invalidCode();
  }
  return {
    id: academy.id,
    timezone: academy.timezone,
    latitude: academy.latitude,
    longitude: academy.longitude,
    attendanceRadiusM: academy.attendanceRadiusM ?? DEFAULT_ATTENDANCE_RADIUS_M,
  };
};

/** Steps 2 to 7: session, window, team, mock, accuracy, distance. */
const validateScan = async (
  tx: TransactionClient,
  academy: ScanAcademy,
  input: ScanInput,
  userId: string,
  now: Date
): Promise<number> => {
  const event = await findEventForAttendanceWrite(
    tx,
    academy.id,
    input.eventId
  );
  const isTodaysSession =
    event?.collectAttendance === true &&
    isSessionDate(toEventDates(event), input.sessionDate) &&
    input.sessionDate === todayInTimeZone(academy.timezone, now);
  if (!(event && isTodaysSession)) {
    throw new NotFoundError("No session to check in to", {
      code: "session_not_found",
    });
  }

  const window = getSessionWindow(event, input.sessionDate, academy.timezone);
  if (!isWithinWindow(window, now)) {
    throw new ForbiddenError(
      now < window.opensAt
        ? "Check-in has not opened yet"
        : "Check-in has closed",
      {
        code: "outside_window",
        details: {
          opensAt: window.opensAt.toISOString(),
          closesAt: window.closesAt.toISOString(),
        },
      }
    );
  }

  const onTeam =
    (await isStudentOfAcademy(tx, academy.id, userId)) &&
    (event.teamId === null ||
      (await isUserOnTeam(tx, academy.id, userId, event.teamId)));
  if (!onTeam) {
    const team = event.teamId
      ? await tx.team.findUnique({
          where: { id: event.teamId },
          select: { name: true, ageGroup: true },
        })
      : null;
    throw new ForbiddenError("This session is not for you", {
      code: "not_on_team",
      details: {
        teamId: event.teamId,
        teamName: team?.name ?? null,
        ageGroup: team?.ageGroup ?? null,
      },
    });
  }

  if (input.isMocked === true) {
    throw new ForbiddenError("Turn off location spoofing to check in", {
      code: "mock_location",
    });
  }
  if (input.accuracyM > MAX_ACCURACY_M) {
    throw new RuleViolationError("Your location is too imprecise", {
      code: "location_imprecise",
      details: { maxAccuracyM: MAX_ACCURACY_M },
    });
  }

  const distance = haversineDistanceM(
    { latitude: input.latitude, longitude: input.longitude },
    { latitude: academy.latitude, longitude: academy.longitude }
  );
  const distanceM = Math.round(distance);
  if (distance > academy.attendanceRadiusM) {
    throw new ForbiddenError(`You're ${distanceM} m from the academy`, {
      code: "too_far",
      details: { distanceM, radiusM: academy.attendanceRadiusM },
    });
  }
  return distanceM;
};

/** The live row for this student and session, locked until the transaction ends. */
const lockLiveRow = async (
  tx: TransactionClient,
  input: ScanInput,
  studentId: string
): Promise<AttendanceRow | null> => {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM attendance
    WHERE event_id = ${input.eventId}
      AND student_id = ${studentId}
      AND session_date = ${input.sessionDate}::date
      AND voided_at IS NULL
    FOR UPDATE
  `;
  const id = locked[0]?.id;
  return id ? tx.attendance.findUniqueOrThrow({ where: { id } }) : null;
};

const alreadyCheckedIn = (row: AttendanceRow | null): ConflictError =>
  new ConflictError("You're already checked in", {
    code: "already_checked_in",
    details: row
      ? {
          checkInAt: row.checkInAt?.toISOString() ?? null,
          attendanceId: row.id,
        }
      : undefined,
  });

const checkIn = async (
  tx: TransactionClient,
  academy: ScanAcademy,
  input: ScanInput,
  studentId: string,
  existing: AttendanceRow | null,
  context: { now: Date; distanceM: number }
): Promise<AttendanceRow> => {
  if (existing) {
    throw alreadyCheckedIn(existing);
  }
  try {
    return await tx.attendance.create({
      data: {
        academyId: academy.id,
        eventId: input.eventId,
        sessionDate: fromPlainDate(input.sessionDate),
        studentId,
        status: "present",
        checkInAt: context.now,
        checkInDistanceM: context.distanceM,
        recordedById: studentId,
      },
    });
  } catch (error) {
    // A simultaneous check-in won the race on the partial unique index.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw alreadyCheckedIn(null);
    }
    throw error;
  }
};

const checkOut = async (
  tx: TransactionClient,
  existing: AttendanceRow | null,
  context: { now: Date; distanceM: number }
): Promise<AttendanceRow> => {
  if (!existing?.checkInAt || existing.status === "absent") {
    throw new ConflictError("You haven't checked in to this session", {
      code: "not_checked_in",
    });
  }
  if (existing.checkOutAt) {
    throw new ConflictError("You're already checked out", {
      code: "already_checked_out",
      details: { checkOutAt: existing.checkOutAt.toISOString() },
    });
  }
  if (context.now < existing.checkInAt) {
    throw new RuleViolationError("Check-out would be before the check-in", {
      code: "check_out_before_check_in",
    });
  }
  return await tx.attendance.update({
    where: { id: existing.id },
    data: { checkOutAt: context.now, checkOutDistanceM: context.distanceM },
  });
};

export const scanAttendance = apiHandler(async ({ request }) => {
  const session = await authenticate(request);
  const body = await readJsonBody(request);
  const input = parseBody(scanSchema, body);
  return withIdempotency(
    { request, userId: session.user.id, body, required: true },
    async (tx) => {
      const now = attendanceClock.now();
      const academy = await verifyToken(tx, input.token);
      const distanceM = await validateScan(
        tx,
        academy,
        input,
        session.user.id,
        now
      );
      const existing = await lockLiveRow(tx, input, session.user.id);
      const context = { now, distanceM };

      if (input.action === "check_in") {
        const row = await checkIn(
          tx,
          academy,
          input,
          session.user.id,
          existing,
          context
        );
        return {
          status: HTTP_CREATED,
          body: {
            data: {
              result: "checked_in",
              attendance: await serializeAttendanceRow(tx, row),
            },
          },
        };
      }

      const after = await checkOut(tx, existing, context);
      await writeAuditLog(tx, {
        request,
        session,
        academyId: academy.id,
        action: "attendance.check_out",
        entityType: "attendance",
        entityId: after.id,
        before: existing,
        after,
      });
      return {
        status: HTTP_OK,
        body: {
          data: {
            result: "checked_out",
            attendance: await serializeAttendanceRow(tx, after),
          },
        },
      };
    }
  );
});
