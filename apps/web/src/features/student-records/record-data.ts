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

export interface AcademicData {
  averagePercent: number | null;
  classSize: number | null;
  contentType: string | null;
  fileName: string | null;
  fileSize: number | null;
  issuedBy: string | null;
  kind: AcademicKind;
  note: string | null;
  /** Report card notes (server template). */
  notes: string | null;
  position: number | null;
  school: string | null;
  schoolYear: string | null;
  /** "Maths A1, English B2" (server template). */
  subjects: string | null;
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

function subjectsText(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const parts = value.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const { subject, grade } = item as { subject?: unknown; grade?: unknown };
    return typeof subject === "string"
      ? [[subject, typeof grade === "string" ? grade : ""].join(" ").trim()]
      : [];
  });
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * The academic fields of a record. Server records follow the `report_card` template
 * (schoolName, term, schoolYear, subjects, averageScore, notes); preview fixtures use
 * the design's fields (kind, school, averagePercent, position, ...). Both are read.
 */
export function academicData(record: StudentRecordView): AcademicData {
  const kind =
    KINDS.find((k) => k === (record.data.kind ?? record.template)) ?? "other";
  return {
    kind,
    school: text(record.data.school) ?? text(record.data.schoolName),
    term: text(record.data.term),
    schoolYear: text(record.data.schoolYear),
    subjects: subjectsText(record.data.subjects),
    notes: text(record.data.notes),
    averagePercent:
      num(record.data.averagePercent) ?? num(record.data.averageScore),
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

/**
 * Coaches as "Coach Patrick" (an admin who also coaches too: "Coach Sharika", as in
 * 47V-0 and G0D-0, since every caller names someone acting as a coach: logging,
 * verifying, ticking in); everyone else by name ("Sharika D.").
 */
export function personLabel(person: PersonRef): string {
  if (person.roles.includes("coach")) {
    return `Coach ${firstName(person.name)}`;
  }
  return person.name;
}
