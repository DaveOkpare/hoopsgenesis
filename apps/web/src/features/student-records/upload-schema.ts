/*
 * The "Upload a record" form (ST-6, 44B-0): a type, a file, and the few fields the type's
 * template asks for. Report cards: school, term, average and position in class.
 */
import z from "zod";

import type { AcademicKind } from "@/features/student-records/queries";
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
  title: "",
  issuedBy: "",
  note: "",
};

const MAX_PERCENT = 100;
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

function checkReportCard(values: UploadFormValues, ctx: z.RefinementCtx) {
  required(ctx, values.school, "school", "Enter your school");
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

export const uploadSchema = z
  .object({
    kind: z.enum(["report_card", "certificate", "other"]),
    file: z.custom<File | null>(),
    school: z.string(),
    term: z.string(),
    average: z.string(),
    position: z.string(),
    classSize: z.string(),
    title: z.string(),
    issuedBy: z.string(),
    note: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.file) {
      const problem = uploadProblem(values.file);
      if (problem) {
        ctx.addIssue({ code: "custom", path: ["file"], message: problem });
      }
    } else {
      ctx.addIssue({
        code: "custom",
        path: ["file"],
        message: "Choose a PDF or photo to upload",
      });
    }
    if (values.kind === "report_card") {
      checkReportCard(values, ctx);
    } else if (values.kind === "certificate") {
      required(ctx, values.title, "title", "Enter the certificate’s name");
      required(ctx, values.issuedBy, "issuedBy", "Enter who issued it");
    } else {
      required(ctx, values.title, "title", "Give it a title");
    }
  });

/** The record's `data` for the chosen template (file details are added on upload). */
export function recordData(values: UploadFormValues): Record<string, unknown> {
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
