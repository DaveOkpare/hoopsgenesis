/**
 * Test-only helpers for the event, dashboard and attendance-summary tests:
 * calendar events and attendance rows written straight to the database.
 * Builds on ../testing/fixtures.ts; never imported by app code.
 */
import { db } from "../../../services";
import type { ApiHandler } from "../handler";
import { fromPlainDate, fromTimeOfDay } from "../serialize";
import {
  apiRequest,
  type TestAcademy,
  type TestUser,
} from "../testing/fixtures";
import { addDays, todayInTimeZone } from "../time";

export const TEST_TIME_ZONE = "Africa/Lagos";

/** `days` from today in the test academies' time zone, as `YYYY-MM-DD`. */
export const dayFromToday = (days: number): string =>
  addDays(todayInTimeZone(TEST_TIME_ZONE), days);

export interface TestEventOptions {
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

export const createTestEvent = async (
  academy: TestAcademy,
  creator: TestUser,
  options: TestEventOptions = {}
): Promise<string> => {
  const startTime =
    options.startTime === undefined ? "16:00" : options.startTime;
  const endTime = options.endTime === undefined ? "18:00" : options.endTime;
  const event = await db.calendarEvent.create({
    data: {
      academyId: academy.id,
      teamId: options.teamId ?? null,
      eventType: options.eventType ?? "training",
      title: options.title ?? "Training",
      startDate: fromPlainDate(options.startDate ?? dayFromToday(0)),
      endDate: options.endDate ? fromPlainDate(options.endDate) : null,
      startTime: startTime === null ? null : fromTimeOfDay(startTime),
      endTime: endTime === null ? null : fromTimeOfDay(endTime),
      excludedDates: (options.excludedDates ?? []).map(fromPlainDate),
      collectAttendance: options.collectAttendance ?? startTime !== null,
      createdById: creator.id,
    },
    select: { id: true },
  });
  return event.id;
};

export const createTestAttendance = async (options: {
  academy: TestAcademy;
  eventId: string;
  student: TestUser;
  recordedBy: TestUser;
  sessionDate: string;
  status?: "present" | "absent" | "late" | "excused";
  voided?: boolean;
}): Promise<string> => {
  const now = new Date();
  const row = await db.attendance.create({
    data: {
      academyId: options.academy.id,
      eventId: options.eventId,
      studentId: options.student.id,
      sessionDate: fromPlainDate(options.sessionDate),
      status: options.status ?? "present",
      recordedById: options.recordedBy.id,
      ...(options.voided
        ? {
            voidedAt: now,
            voidedById: options.recordedBy.id,
            voidReason: "test void",
          }
        : {}),
    },
    select: { id: true },
  });
  return row.id;
};

/**
 * Deletes the academies' attendance rows and events. Run before
 * ../testing/fixtures.ts `cleanup`: an academy with audit rows is kept, and
 * its events (created_by is Restrict) would then block deleting their
 * creators.
 */
export const deleteTestEvents = async (
  academies: readonly TestAcademy[]
): Promise<void> => {
  const academyIds = academies.map((academy) => academy.id);
  await db.attendance.deleteMany({ where: { academyId: { in: academyIds } } });
  await db.calendarEvent.deleteMany({
    where: { academyId: { in: academyIds } },
  });
};

export interface TestResponse {
  // biome-ignore lint/suspicious/noExplicitAny: tests inspect response bodies ad hoc
  body: any;
  status: number;
}

/** Calls a handler the way the router would. */
export const callHandler = async (
  handler: ApiHandler,
  options: {
    path: string;
    params: Record<string, string>;
    user?: TestUser;
    method?: string;
    body?: unknown;
  }
): Promise<TestResponse> => {
  const response = await handler({
    request: apiRequest(options.path, {
      user: options.user,
      method: options.method,
      body: options.body,
    }),
    params: options.params,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text.length > 0 ? JSON.parse(text) : null,
  };
};
