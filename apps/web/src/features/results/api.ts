/*
 * Log an athletic result (CO-8). See the convention in features/viewer/api.ts; the
 * fixture version is ./api.mock.ts (dev preview only).
 */
import {
  type AthleticData,
  buildResultData,
  chipsFromServer,
  type ExtraValues,
  type ResultTemplate,
  type ServerRecordTemplate,
} from "@/features/results/templates";
import type { DateOnly, Id, StudentRecord } from "@/features/types";
import { academyPath, apiAll, apiData } from "@/lib/api-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

export interface CoachStudent {
  id: Id;
  name: string;
  /** Not stored by the server; real mode says "their" ("Same as their best"). */
  pronoun: "she" | "he" | "they";
  /** The team's sport; not stored by the server, so null in real mode. */
  sport: string | null;
  teamId: Id;
  teamName: string;
}

export interface PastResult {
  data: AthleticData;
  id: Id;
  recordedOn: DateOnly;
}

export interface SessionOption {
  eventId: Id;
  /** "U14 Training" */
  label: string;
}

interface RosterMember {
  name: string;
  roles: string[];
  userId: Id;
}

interface ServerRecord {
  data: Record<string, unknown>;
  id: Id;
  recordedOn: DateOnly;
  status: "pending" | "verified" | "rejected";
}

interface ServerOccurrence {
  cancelled: boolean;
  id: Id;
  teamId: Id | null;
  title: string;
}

/**
 * The templates the form offers: the server's athletic templates, one chip per metric.
 * GET /record-templates?recordType=athletic&latest=true.
 */
export async function listResultTemplates(
  academyId: Id,
  params: { teamId: Id | null }
): Promise<ResultTemplate[]> {
  if (mock) {
    return (await mock()).listResultTemplates(academyId, params);
  }
  // The server's templates are the same for every team (it stores no sport), so the
  // student's team does not narrow them in real mode.
  const templates = await apiData<ServerRecordTemplate[]>(
    academyPath(academyId, "/record-templates"),
    { query: { recordType: "athletic", latest: true } }
  );
  return chipsFromServer(templates);
}

/**
 * Students on the coach's teams, for the student picker.
 * GET /teams/:teamId/members for each team the coach is on.
 */
export async function listCoachStudents(
  academyId: Id,
  params: { teams: { id: Id; name: string }[] }
): Promise<CoachStudent[]> {
  if (mock) {
    return (await mock()).listCoachStudents(academyId, params);
  }
  const rosters = await Promise.all(
    params.teams.map((team) =>
      apiAll<RosterMember>(academyPath(academyId, `/teams/${team.id}/members`))
    )
  );
  const seen = new Set<Id>();
  const students: CoachStudent[] = [];
  params.teams.forEach((team, index) => {
    for (const m of rosters[index] ?? []) {
      if (m.roles.includes("student") && !seen.has(m.userId)) {
        seen.add(m.userId);
        students.push({
          id: m.userId,
          name: m.name,
          pronoun: "they",
          sport: null,
          teamId: team.id,
          teamName: team.name,
        });
      }
    }
  });
  return students.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A student's recent results for one template, oldest first (rejected ones left out).
 * GET /students/:studentId/records?recordType=athletic&template=<key>.
 */
export async function listRecentResults(
  academyId: Id,
  params: { studentId: Id; template: ResultTemplate }
): Promise<PastResult[]> {
  if (mock) {
    return (await mock()).listRecentResults(academyId, params);
  }
  const { template } = params;
  if (!template.key) {
    return [];
  }
  const records = await apiAll<ServerRecord>(
    academyPath(academyId, `/students/${params.studentId}/records`),
    {
      query: { recordType: "athletic", template: template.key },
      maxItems: 50,
    }
  );
  return records
    .filter(
      (r) =>
        r.status !== "rejected" && typeof r.data[template.field] === "number"
    )
    .map((r) => ({ id: r.id, recordedOn: r.recordedOn, data: r.data }))
    .sort((a, b) => a.recordedOn.localeCompare(b.recordedOn));
}

/**
 * Sessions of the student's team on a date, for the "Session" field.
 * GET /events?from=date&to=date&teamId=.
 */
export async function listSessionOptions(
  academyId: Id,
  params: { teamId: Id; teamName: string; date: DateOnly }
): Promise<SessionOption[]> {
  if (mock) {
    return (await mock()).listSessionOptions(academyId, params);
  }
  const events = await apiAll<ServerOccurrence>(
    academyPath(academyId, "/events"),
    { query: { from: params.date, to: params.date, teamId: params.teamId } }
  );
  return events
    .filter((e) => e.teamId === params.teamId && !e.cancelled)
    .map((e) => ({
      eventId: e.id,
      // "U14 Training"; a title that already names the team ("U14 training") stays.
      label: e.title.toLowerCase().startsWith(params.teamName.toLowerCase())
        ? e.title
        : `${params.teamName} ${e.title}`,
    }));
}

/**
 * Save an athletic result; it waits for verification like any record.
 * POST /students/:studentId/records { recordType: "athletic", recordedOn, schemaVersion,
 * data: { template, ...fields } }. The recorder is the session user. The server's
 * templates have no field for the session, so `eventId` is not stored.
 */
export async function createAthleticRecord(
  academyId: Id,
  input: {
    studentId: Id;
    recordedOn: DateOnly;
    template: ResultTemplate;
    score: number;
    extras?: ExtraValues;
    eventId?: Id;
  }
): Promise<StudentRecord> {
  if (mock) {
    return (await mock()).createAthleticRecord(academyId, input);
  }
  return await apiData<StudentRecord>(
    academyPath(academyId, `/students/${input.studentId}/records`),
    {
      method: "POST",
      body: {
        recordType: "athletic",
        recordedOn: input.recordedOn,
        schemaVersion: input.template.schemaVersion,
        data: buildResultData(input.template, input.score, input.extras),
      },
    }
  );
}
