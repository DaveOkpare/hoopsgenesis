/*
 * The "Upload a record" form (ST-6, 44B-0): a type, a file, and the few fields the type's
 * template asks for. Which fields show depends on the record template from
 * GET /record-templates (its JSON Schema properties). The server's `report_card`
 * template takes schoolName, term, schoolYear, subjects (at least one, with a grade),
 * averageScore and notes; it has no certificate or "other" template and no position in
 * class, so those only appear in preview (the design's fields).
 */
import z from "zod";

import type {
  AcademicKind,
  RecordTemplate,
} from "@/features/student-records/queries";
import { uploadProblem } from "@/features/student-records/upload-rules";

export interface UploadFormValues {
  average: string;
  classSize: string;
  file: File | null;
  issuedBy: string;
  kind: AcademicKind;
  note: string;
  position: string;
  school: string;
  schoolYear: string;
  /** "Maths A1, English B+": subject then grade, comma separated. */
  subjects: string;
  term: string;
  title: string;
}

export const emptyUploadForm: UploadFormValues = {
  kind: "report_card",
  file: null,
  school: "",
  term: "",
  average: "",
  position: "",
  classSize: "",
  schoolYear: "",
  subjects: "",
  title: "",
  issuedBy: "",
  note: "",
};

const MAX_PERCENT = 100;
const MAX_GRADE_LENGTH = 8;
const SUBJECT_SEPARATOR = /[,\n]/;
const WHITESPACE = /\s+/;

/** The template's `data` fields (JSON Schema properties). */
export function templateFields(
  template: RecordTemplate | undefined
): Set<string> {
  return new Set(Object.keys(template?.jsonSchema.properties ?? {}));
}

/** "Maths A1, English B+" -> [{ subject: "Maths", grade: "A1" }, ...]; null if malformed. */
export function parseSubjects(
  value: string
): { subject: string; grade: string }[] | null {
  const items = value
    .split(SUBJECT_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);
  const parsed = items.map((item) => {
    const words = item.split(WHITESPACE);
    const grade = words.pop() ?? "";
    return { subject: words.join(" "), grade };
  });
  const valid =
    parsed.length > 0 &&
    parsed.every(
      (row) => row.subject && row.grade && row.grade.length <= MAX_GRADE_LENGTH
    );
  return valid ? parsed : null;
}
const WHOLE_NUMBER = /^\d+$/;
const PERCENT = /^\d{1,3}(\.\d)?$/;

function required(
  ctx: z.RefinementCtx,
  value: string,
  path: keyof UploadFormValues,
  message: string
) {
  if (!value.trim()) {
    ctx.addIssue({ code: "custom", path: [path], message });
  }
}

function checkReportCard(
  values: UploadFormValues,
  ctx: z.RefinementCtx,
  fields: Set<string>
) {
  required(ctx, values.school, "school", "Enter your school");
  if (fields.has("schoolYear")) {
    required(
      ctx,
      values.schoolYear,
      "schoolYear",
      "Enter the school year, e.g. 2026/2027"
    );
  }
  if (fields.has("subjects") && !parseSubjects(values.subjects)) {
    ctx.addIssue({
      code: "custom",
      path: ["subjects"],
      message: "List each subject with its grade, e.g. Maths A1, English B+",
    });
  }
  required(ctx, values.term, "term", "Enter the term, e.g. Term 3, 2026");
  const average = values.average.trim().replace("%", "");
  if (!average) {
    ctx.addIssue({
      code: "custom",
      path: ["average"],
      message: "Enter your average",
    });
  } else if (!PERCENT.test(average) || Number(average) > MAX_PERCENT) {
    ctx.addIssue({
      code: "custom",
      path: ["average"],
      message: "Average is a percentage from 0 to 100",
    });
  }
  const position = values.position.trim();
  const classSize = values.classSize.trim();
  if (position && !(WHOLE_NUMBER.test(position) && Number(position) > 0)) {
    ctx.addIssue({
      code: "custom",
      path: ["position"],
      message: "Position is a whole number",
    });
  }
  if (classSize && !(WHOLE_NUMBER.test(classSize) && Number(classSize) > 0)) {
    ctx.addIssue({
      code: "custom",
      path: ["position"],
      message: "Class size is a whole number",
    });
  } else if (position && classSize && Number(position) > Number(classSize)) {
    ctx.addIssue({
      code: "custom",
      path: ["position"],
      message: "Position can’t be more than the class size",
    });
  } else if (Boolean(position) !== Boolean(classSize)) {
    ctx.addIssue({
      code: "custom",
      path: ["position"],
      message: "Enter both your position and the class size, or neither",
    });
  }
}

/** The form's rules for the chosen kind's template. */
export const uploadSchemaFor = (
  fieldsFor: (kind: AcademicKind) => Set<string>
) =>
  z
    .object({
      kind: z.enum(["report_card", "certificate", "other"]),
      file: z.custom<File | null>(),
      school: z.string(),
      term: z.string(),
      average: z.string(),
      position: z.string(),
      classSize: z.string(),
      schoolYear: z.string(),
      subjects: z.string(),
      title: z.string(),
      issuedBy: z.string(),
      note: z.string(),
    })
    .superRefine((values, ctx) => {
      // The file is optional (FDO-0): the reviewer checks the typed values.
      if (values.file) {
        const problem = uploadProblem(values.file);
        if (problem) {
          ctx.addIssue({ code: "custom", path: ["file"], message: problem });
        }
      }
      if (values.kind === "report_card") {
        checkReportCard(values, ctx, fieldsFor(values.kind));
      } else if (values.kind === "certificate") {
        required(ctx, values.title, "title", "Enter the certificate’s name");
        required(ctx, values.issuedBy, "issuedBy", "Enter who issued it");
      } else {
        required(ctx, values.title, "title", "Give it a title");
      }
    });

function optionalText(value: string): string | undefined {
  return value.trim() || undefined;
}

/** `data` for the server's report_card template (`template` key included). */
function serverReportCard(values: UploadFormValues): Record<string, unknown> {
  const average = values.average.trim().replace("%", "");
  return {
    template: "report_card",
    schoolName: optionalText(values.school),
    term: values.term.trim(),
    schoolYear: values.schoolYear.trim(),
    subjects: parseSubjects(values.subjects) ?? [],
    averageScore: average ? Number(average) : undefined,
  };
}

/**
 * The record's `data` for the chosen template. Server templates carry their key in
 * `data.template`; preview's design templates use the design's fields (file details are
 * added on upload there).
 */
export function recordData(
  values: UploadFormValues,
  fields: Set<string>
): Record<string, unknown> {
  if (fields.has("template") && values.kind === "report_card") {
    return serverReportCard(values);
  }
  if (values.kind === "report_card") {
    return {
      kind: values.kind,
      school: values.school.trim(),
      term: values.term.trim(),
      averagePercent: Number(values.average.trim().replace("%", "")),
      position: values.position.trim() ? Number(values.position) : null,
      classSize: values.classSize.trim() ? Number(values.classSize) : null,
    };
  }
  if (values.kind === "certificate") {
    return {
      kind: values.kind,
      title: values.title.trim(),
      issuedBy: values.issuedBy.trim(),
    };
  }
  return {
    kind: values.kind,
    title: values.title.trim(),
    note: values.note.trim() || null,
  };
}
