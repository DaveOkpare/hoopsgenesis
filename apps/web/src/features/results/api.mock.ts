/* Preview-mode (fixture) implementation of features/results/api.ts. Dev only. */
import { fixtureDelay, teams } from "@/features/fixtures";
import type {
  CoachStudent,
  PastResult,
  SessionOption,
} from "@/features/results/api";
import {
  type AthleticData,
  buildResultData,
  DESIGN_TEMPLATES,
  type DrillId,
  type ResultTemplate,
} from "@/features/results/templates";
import { calendarEvents } from "@/features/sessions/fixtures";
import { academyMembers } from "@/features/team-detail/fixtures";
import type { DateOnly, Id, StudentRecord } from "@/features/types";

/** Jean's free throws from 3P1-0, oldest first. */
const history: (PastResult & { studentId: Id })[] = [
  {
    id: "res-jean-1",
    studentId: "user-jean",
    recordedOn: "2026-10-26",
    data: { drill: "free_throws", made: 5, attempts: 10 },
  },
  {
    id: "res-jean-2",
    studentId: "user-jean",
    recordedOn: "2026-11-02",
    data: { drill: "free_throws", made: 6, attempts: 10 },
  },
  {
    id: "res-jean-3",
    studentId: "user-jean",
    recordedOn: "2026-11-09",
    data: { drill: "free_throws", made: 7, attempts: 10 },
  },
  {
    id: "res-jean-4",
    studentId: "user-jean",
    recordedOn: "2026-11-16",
    data: { drill: "free_throws", made: 6, attempts: 10 },
  },
];

const SEED_DATES: DateOnly[] = ["2026-11-02", "2026-11-09", "2026-11-16"];
const SEED_MADE = [4, 6, 5];
const SEED_SECONDS = [44, 42, 43];

/** Three past results for anyone else, so the chart is never empty in preview. */
function seeded(studentId: Id, drill: DrillId): PastResult[] {
  return SEED_DATES.map((recordedOn, index) => ({
    id: `res-${studentId}-${drill}-${index}`,
    recordedOn,
    data:
      drill === "dribbling"
        ? { drill, seconds: SEED_SECONDS[index] ?? 45 }
        : { drill, made: SEED_MADE[index] ?? 5, attempts: 10 },
  }));
}

/** The preview coach (Sharika). */
const PREVIEW_VIEWER = "user-sharika";

export async function listResultTemplates(
  _academyId: Id
): Promise<ResultTemplate[]> {
  await fixtureDelay();
  return DESIGN_TEMPLATES;
}

export async function listCoachStudents(
  academyId: Id,
  params: { teams: { id: Id; name: string }[] }
): Promise<CoachStudent[]> {
  await fixtureDelay();
  const teamIds = params.teams.map((t) => t.id);
  return academyMembers
    .filter((m) => m.academyId === academyId && m.roles.includes("student"))
    .flatMap((m) => {
      const teamId = m.teamIds.find((id) => teamIds.includes(id));
      const team = teams.find((t) => t.id === teamId);
      return team
        ? [
            {
              id: m.userId,
              name: m.user.name,
              teamId: team.id,
              teamName: team.name,
            },
          ]
        : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listRecentResults(
  _academyId: Id,
  params: { studentId: Id; template: ResultTemplate }
): Promise<PastResult[]> {
  await fixtureDelay();
  const drill = params.template.id;
  const own = history.filter(
    (r) => r.studentId === params.studentId && r.data.drill === drill
  );
  const list = own.length ? own : seeded(params.studentId, drill);
  return [...list].sort((a, b) => a.recordedOn.localeCompare(b.recordedOn));
}

export async function listSessionOptions(
  academyId: Id,
  params: { teamId: Id; teamName: string; date: DateOnly }
): Promise<SessionOption[]> {
  await fixtureDelay();
  const team = teams.find((t) => t.id === params.teamId);
  return calendarEvents
    .filter(
      (e) =>
        e.academyId === academyId &&
        e.teamId === params.teamId &&
        e.startDate === params.date &&
        !e.excludedDates.includes(params.date)
    )
    .map((e) => ({
      eventId: e.id,
      label: team ? `${team.name} ${e.title}` : e.title,
    }));
}

let nextRecord = 1;

export async function createAthleticRecord(
  academyId: Id,
  input: {
    studentId: Id;
    recordedOn: DateOnly;
    template: ResultTemplate;
    score: number;
    eventId?: Id;
  }
): Promise<StudentRecord> {
  await fixtureDelay();
  const id = `record-new-${nextRecord}`;
  nextRecord += 1;
  const data = buildResultData(input.template, input.score) as AthleticData;
  history.push({
    id,
    studentId: input.studentId,
    recordedOn: input.recordedOn,
    data,
  });
  return {
    id,
    academyId,
    studentId: input.studentId,
    recordType: "athletic",
    recordedBy: PREVIEW_VIEWER,
    recordedOn: input.recordedOn,
    data: { ...data, sport: "basketball", eventId: input.eventId },
    schemaVersion: 1,
    fileUrl: null,
    status: "pending",
    verifiedBy: null,
    reviewNote: null,
    createdAt: new Date().toISOString(),
  };
}
