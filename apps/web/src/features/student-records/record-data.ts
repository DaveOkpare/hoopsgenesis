/*
 * Reading a record's `data` (validated on the server per recordType + schemaVersion) and
 * naming the people on it. Pure helpers, safe anywhere.
 */
import type {
  AcademicKind,
  PersonRef,
  StudentRecordView,
} from "@/features/student-records/queries";
import { firstName } from "@/lib/format";

export interface AthleticResult {
  attempts: number;
  drill: string;
  made: number;
}

export interface AcademicData {
  averagePercent: number | null;
  classSize: number | null;
  contentType: string | null;
  fileName: string | null;
  fileSize: number | null;
  issuedBy: string | null;
  kind: AcademicKind;
  note: string | null;
  position: number | null;
  school: string | null;
  term: string | null;
  title: string | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const KINDS: readonly AcademicKind[] = ["report_card", "certificate", "other"];

export function athleticResult(
  record: StudentRecordView
): AthleticResult | null {
  if (record.recordType !== "athletic") {
    return null;
  }
  const drill = text(record.data.drill);
  const made = num(record.data.made);
  const attempts = num(record.data.attempts);
  if (!drill || made === null || attempts === null) {
    return null;
  }
  return { drill, made, attempts };
}

export function academicData(record: StudentRecordView): AcademicData {
  const kind = KINDS.find((k) => k === record.data.kind) ?? "other";
  return {
    kind,
    school: text(record.data.school),
    term: text(record.data.term),
    averagePercent: num(record.data.averagePercent),
    position: num(record.data.position),
    classSize: num(record.data.classSize),
    title: text(record.data.title),
    issuedBy: text(record.data.issuedBy),
    note: text(record.data.note),
    fileName: text(record.data.fileName),
    fileSize: num(record.data.fileSize),
    contentType: text(record.data.contentType),
  };
}

export const ACADEMIC_KIND_LABEL: Record<AcademicKind, string> = {
  report_card: "Report card",
  certificate: "Certificate",
  other: "Other",
};

/** "Term 2 report card", "First aid certificate", or the kind. */
export function academicTitle(data: AcademicData): string {
  if (data.kind === "report_card") {
    const term = data.term?.split(",")[0];
    return term ? `${term} report card` : "Report card";
  }
  return data.title ?? ACADEMIC_KIND_LABEL[data.kind];
}

/** Academy admins by name ("Sharika D."), coaches as "Coach Patrick". */
export function personLabel(person: PersonRef): string {
  if (person.roles.includes("admin")) {
    return person.name;
  }
  if (person.roles.includes("coach")) {
    return `Coach ${firstName(person.name)}`;
  }
  return person.name;
}
