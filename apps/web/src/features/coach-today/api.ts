/*
 * Coach Today (CO-1): the "Records waiting for you" panel and the phone nudge.
 * Sessions come from features/sessions, the team table from features/team-detail.
 * The full review queue is /coach/records (features/records); this reads only what the
 * panel needs, from the same endpoint, so the panel and the queue agree.
 * See the convention in features/viewer/api.ts; fixtures live in ./api.mock.ts.
 */
import { formatResult } from "@/features/results/templates";
import type { Id, RecordType } from "@/features/types";
import { academyPath, apiAll, apiData } from "@/lib/api-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

export interface RecordToReview {
  id: Id;
  recordType: RecordType;
  studentId: Id;
  studentName: string;
  /** "Free throws · 8 of 10", "Report card · Term 3". */
  summary: string;
  teamName: string | null;
}

/** A record as GET /records returns it (the fields this panel reads). */
interface ServerRecord {
  data: Record<string, unknown>;
  id: Id;
  recordType: RecordType;
  student: { id: Id; name: string };
  studentId: Id;
}

interface RosterMember {
  roles: string[];
  userId: Id;
}

/** "100 m sprint · 12.4 s", "Report card · First term". */
export function summarizeRecord(record: {
  recordType: RecordType;
  data: Record<string, unknown>;
}): string {
  const { data } = record;
  if (record.recordType === "athletic") {
    return formatResult(data);
  }
  const term = typeof data.term === "string" ? data.term.split(",")[0] : null;
  return term ? `Report card · ${term}` : "Report card";
}

/** studentId -> team name, from the rosters of the coach's teams. */
async function studentTeams(
  academyId: Id,
  teams: { id: Id; name: string }[]
): Promise<Map<Id, string>> {
  const rosters = await Promise.all(
    teams.map((team) =>
      apiAll<RosterMember>(academyPath(academyId, `/teams/${team.id}/members`))
    )
  );
  const result = new Map<Id, string>();
  teams.forEach((team, index) => {
    for (const member of rosters[index] ?? []) {
      if (member.roles.includes("student") && !result.has(member.userId)) {
        result.set(member.userId, team.name);
      }
    }
  });
  return result;
}

/**
 * Pending records on the coach's teams, oldest first. GET /records?status=pending: the
 * server scopes it to the coach's teams and leaves out the coach's own entries. Team
 * names come from the coach's rosters (GET /teams/:teamId/members).
 */
export async function listRecordsToReview(
  academyId: Id,
  params: { teams: { id: Id; name: string }[] }
): Promise<RecordToReview[]> {
  if (mock) {
    return (await mock()).listRecordsToReview(academyId, params);
  }
  const [records, teamOf] = await Promise.all([
    apiAll<ServerRecord>(academyPath(academyId, "/records"), {
      query: { status: "pending" },
    }),
    studentTeams(academyId, params.teams),
  ]);
  return records.map((record) => ({
    id: record.id,
    recordType: record.recordType,
    studentId: record.studentId,
    studentName: record.student.name,
    teamName: teamOf.get(record.studentId) ?? null,
    summary: summarizeRecord(record),
  }));
}

/** One-tap verify (CO-9). POST /records/:id/verify (the verifier is the session user). */
export async function verifyRecord(
  academyId: Id,
  input: { recordId: Id }
): Promise<{ id: Id }> {
  if (mock) {
    return (await mock()).verifyRecord(academyId, input);
  }
  await apiData(academyPath(academyId, `/records/${input.recordId}/verify`), {
    method: "POST",
    body: {},
  });
  return { id: input.recordId };
}
