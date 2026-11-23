/**
 * Test helpers for the record, upload and template endpoints. Builds on
 * ../testing/fixtures.ts.
 */
import { db } from "../../../services";
import type { ApiHandler } from "../handler";
import {
  apiRequest,
  cleanup,
  type TestAcademy,
  type TestUser,
} from "../testing/fixtures";

export interface CallOptions {
  academyId: string;
  body?: unknown;
  method?: string;
  params?: Record<string, string>;
  path: string;
  user?: TestUser;
}

/** Calls a handler the way the router would. `path` is under the academy. */
export const callApi = (
  handler: ApiHandler,
  options: CallOptions
): Promise<Response> =>
  handler({
    request: apiRequest(
      `/api/v1/academies/${options.academyId}${options.path}`,
      { user: options.user, method: options.method, body: options.body }
    ),
    params: { academyId: options.academyId, ...options.params },
  });

export const sprintData = (timeSeconds = 12.4) => ({
  template: "sprint_100m",
  timeSeconds,
  timing: "hand",
});

export const reportCardData = () => ({
  template: "report_card",
  term: "First term",
  schoolYear: "2026/2027",
  subjects: [
    { subject: "Mathematics", grade: "A1", score: 91 },
    { subject: "English", grade: "B2" },
  ],
});

/**
 * student_record rows block deleting their academy and users (Restrict), so
 * remove the ones in these test academies first, then the usual cleanup.
 */
export const cleanupWithRecords = async (
  academies: readonly TestAcademy[],
  users: readonly TestUser[]
): Promise<void> => {
  await db.studentRecord.deleteMany({
    where: { academyId: { in: academies.map((academy) => academy.id) } },
  });
  await cleanup(academies, users);
};
