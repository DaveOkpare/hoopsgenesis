/**
 * Test-only helpers for the attendance, QR and scan tests. Events are
 * written with Prisma directly (the events endpoints belong elsewhere).
 */
import { vi } from "vitest";

import { db } from "../../../services";
import { fromPlainDate, fromTimeOfDay } from "../serialize";
import type { TestAcademy, TestUser } from "../testing/fixtures";
import { attendanceClock } from "./attendance-shared";

/** All tests run on this academy-local day (Africa/Lagos, UTC+1). */
export const SESSION_DATE = "2026-11-23";
export const YESTERDAY = "2026-11-22";
export const TOMORROW = "2026-11-24";
/** 16:00 to 18:00 local, so the window is 15:30 to 19:00 local (14:30Z to 18:00Z). */
export const START_TIME = "16:00";
export const END_TIME = "18:00";
/** 16:30 local: inside the window. */
export const DURING_SESSION = new Date("2026-11-23T15:30:00.000Z");
/** 15:29 local: one minute before the window opens. */
export const BEFORE_WINDOW = new Date("2026-11-23T14:29:00.000Z");
/** 19:01 local: one minute after the window closes. */
export const AFTER_WINDOW = new Date("2026-11-23T18:01:00.000Z");

/** The fixture academy's coordinates (createTestAcademy) and points near and far. */
export const ACADEMY_POINT = { latitude: 6.5244, longitude: 3.3792 };
export const NEAR_POINT = { latitude: 6.5245, longitude: 3.3793 };
/** About 620 m north of the academy. */
export const FAR_POINT = { latitude: 6.53, longitude: 3.3792 };

export const setClock = (now: Date): void => {
  vi.spyOn(attendanceClock, "now").mockReturnValue(now);
};

export interface TestEventOptions {
  collectAttendance?: boolean;
  endDate?: string | null;
  endTime?: string | null;
  excludedDates?: string[];
  startDate?: string;
  startTime?: string | null;
  teamId?: string | null;
}

export const createTestEvent = async (
  academy: TestAcademy,
  creator: TestUser,
  options: TestEventOptions = {}
): Promise<string> => {
  const startTime =
    options.startTime === undefined ? START_TIME : options.startTime;
  const endTime = options.endTime === undefined ? END_TIME : options.endTime;
  const event = await db.calendarEvent.create({
    data: {
      academyId: academy.id,
      teamId: options.teamId ?? null,
      eventType: "training",
      title: "Training",
      startDate: fromPlainDate(options.startDate ?? SESSION_DATE),
      endDate: options.endDate ? fromPlainDate(options.endDate) : null,
      startTime: startTime ? fromTimeOfDay(startTime) : null,
      endTime: endTime ? fromTimeOfDay(endTime) : null,
      excludedDates: (options.excludedDates ?? []).map(fromPlainDate),
      collectAttendance: options.collectAttendance ?? true,
      createdById: creator.id,
    },
    select: { id: true },
  });
  return event.id;
};

/** Deletes the academies' attendance and events, then runs `cleanup`. */
export const deleteAttendanceData = async (
  academies: readonly TestAcademy[]
): Promise<void> => {
  const academyIds = academies.map((academy) => academy.id);
  await db.attendance.deleteMany({ where: { academyId: { in: academyIds } } });
  await db.calendarEvent.deleteMany({
    where: { academyId: { in: academyIds } },
  });
};

/** Parses a handler's JSON response. */
export const readJson = async <T = Record<string, unknown>>(
  response: Response
): Promise<T> => (await response.json()) as T;

export interface ErrorBody {
  error: { code: string; details?: Record<string, unknown>; message: string };
}

export interface AttendanceItem {
  checkInAt: string | null;
  checkInDistanceM: number | null;
  checkOutAt: string | null;
  checkOutDistanceM: number | null;
  eventId: string;
  id: string;
  recordedById: string;
  sessionDate: string;
  status: string;
  studentId: string;
  verifiedAt: string | null;
  verifiedById: string | null;
  voidedAt: string | null;
  voidedById: string | null;
  voidReason: string | null;
}
