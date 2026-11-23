/**
 * Record templates: the shape of student_record.data per record type,
 * template and schema version. App config for now (the user stories leave
 * "app config or an academy-editable table" open); every academy sees the
 * same list.
 *
 * STARTER SET: three placeholder templates (an academic report card, a 100 m
 * sprint time and a fitness test) to build the flows against. Replace or
 * extend them with the academy's real forms.
 *
 * How `data` names its template: `data.template` holds the template key, and
 * the request's `schemaVersion` picks the version. So a record body is
 * `{ recordType, recordedOn, schemaVersion, data: { template, ...fields } }`.
 * Keeping the key inside `data` stores it with the record (there is no
 * column for it) and lets queries match it through the jsonb GIN index.
 *
 * Changing a template: never edit a published version's schema in a way
 * that would reject stored rows. Add a new entry with `schemaVersion + 1`;
 * old records keep validating against their own version.
 */
import { z } from "zod";

export type RecordType = "academic" | "athletic";

/** For charts (ST-7): which field is the result, and which way is better. */
export interface RecordMetric {
  better: "higher" | "lower";
  field: string;
  label: string;
  unit: string | null;
}

export interface RecordTemplate {
  description: string;
  /** Stable id, stored as `data.template`. snake_case. */
  key: string;
  label: string;
  metrics: readonly RecordMetric[];
  recordType: RecordType;
  /** Validates the whole `data` object, `template` included. Strict. */
  schema: z.ZodType;
  schemaVersion: number;
}

const MAX_TEXT = 200;
const MAX_NOTES = 1000;
const MAX_SUBJECTS = 30;
const MAX_GRADE_LENGTH = 8;
const MAX_PERCENT = 100;
const MIN_SPRINT_SECONDS = 9;
const MAX_SPRINT_SECONDS = 60;
const MAX_WIND_MPS = 20;
const MAX_BEEP_LEVEL = 21;
const MAX_REPS = 500;
const MAX_JUMP_CM = 150;
const MAX_SECONDS_IN_TEST = 600;

const text = (max = MAX_TEXT) => z.string().trim().min(1).max(max);
const notes = text(MAX_NOTES).optional().meta({ title: "Notes" });

const reportCardV1 = z
  .strictObject({
    template: z.literal("report_card"),
    schoolName: text().optional().meta({ title: "School" }),
    term: text(64).meta({
      title: "Term",
      description: 'e.g. "First term" or "Semester 1"',
    }),
    schoolYear: text(16).meta({
      title: "School year",
      description: 'e.g. "2026/2027"',
    }),
    subjects: z
      .array(
        z.strictObject({
          subject: text(64).meta({ title: "Subject" }),
          grade: text(MAX_GRADE_LENGTH).meta({
            title: "Grade",
            description: 'As printed, e.g. "A1" or "B+"',
          }),
          score: z
            .number()
            .min(0)
            .max(MAX_PERCENT)
            .optional()
            .meta({ title: "Score (%)" }),
        })
      )
      .min(1)
      .max(MAX_SUBJECTS)
      .meta({ title: "Subjects" }),
    averageScore: z
      .number()
      .min(0)
      .max(MAX_PERCENT)
      .optional()
      .meta({ title: "Average (%)" }),
    notes,
  })
  .meta({ title: "Report card" });

const sprint100mV1 = z
  .strictObject({
    template: z.literal("sprint_100m"),
    timeSeconds: z
      .number()
      .min(MIN_SPRINT_SECONDS)
      .max(MAX_SPRINT_SECONDS)
      .meta({ title: "Time (s)" }),
    timing: z
      .enum(["hand", "electronic"])
      .meta({ title: "Timing", description: "Stopwatch or electronic" }),
    windMps: z
      .number()
      .min(-MAX_WIND_MPS)
      .max(MAX_WIND_MPS)
      .optional()
      .meta({ title: "Wind (m/s)" }),
    notes,
  })
  .meta({ title: "100 m sprint" });

const fitnessTestV1 = z
  .strictObject({
    template: z.literal("fitness_test"),
    beepTestLevel: z
      .number()
      .min(1)
      .max(MAX_BEEP_LEVEL)
      .optional()
      .meta({ title: "Beep test level", description: "e.g. 9.5" }),
    pushUps: z
      .int()
      .min(0)
      .max(MAX_REPS)
      .optional()
      .meta({ title: "Push-ups (1 min)" }),
    sitUps: z
      .int()
      .min(0)
      .max(MAX_REPS)
      .optional()
      .meta({ title: "Sit-ups (1 min)" }),
    verticalJumpCm: z
      .number()
      .min(0)
      .max(MAX_JUMP_CM)
      .optional()
      .meta({ title: "Vertical jump (cm)" }),
    plankSeconds: z
      .int()
      .min(0)
      .max(MAX_SECONDS_IN_TEST)
      .optional()
      .meta({ title: "Plank (s)" }),
    notes,
  })
  .refine(
    (value) =>
      [
        value.beepTestLevel,
        value.pushUps,
        value.sitUps,
        value.verticalJumpCm,
        value.plankSeconds,
      ].some((measurement) => measurement !== undefined),
    { message: "Record at least one measurement" }
  )
  .meta({ title: "Fitness test" });

export const RECORD_TEMPLATES: readonly RecordTemplate[] = [
  {
    key: "report_card",
    recordType: "academic",
    schemaVersion: 1,
    label: "Report card",
    description:
      "STARTER TEMPLATE. A term's report card: subjects and grades, with a photo or PDF of the card.",
    metrics: [
      {
        field: "averageScore",
        label: "Average",
        unit: "%",
        better: "higher",
      },
    ],
    schema: reportCardV1,
  },
  {
    key: "sprint_100m",
    recordType: "athletic",
    schemaVersion: 1,
    label: "100 m sprint",
    description: "STARTER TEMPLATE. One timed 100 m run.",
    metrics: [
      { field: "timeSeconds", label: "Time", unit: "s", better: "lower" },
    ],
    schema: sprint100mV1,
  },
  {
    key: "fitness_test",
    recordType: "athletic",
    schemaVersion: 1,
    label: "Fitness test",
    description:
      "STARTER TEMPLATE. A fitness check; fill in the parts that were tested.",
    metrics: [
      {
        field: "beepTestLevel",
        label: "Beep test",
        unit: null,
        better: "higher",
      },
      { field: "pushUps", label: "Push-ups", unit: null, better: "higher" },
      { field: "sitUps", label: "Sit-ups", unit: null, better: "higher" },
      {
        field: "verticalJumpCm",
        label: "Vertical jump",
        unit: "cm",
        better: "higher",
      },
      { field: "plankSeconds", label: "Plank", unit: "s", better: "higher" },
    ],
    schema: fitnessTestV1,
  },
];

const registryKey = (
  recordType: RecordType,
  key: string,
  schemaVersion: number
): string => `${recordType}:${key}:${schemaVersion}`;

const registry = new Map<string, RecordTemplate>();
for (const template of RECORD_TEMPLATES) {
  const id = registryKey(
    template.recordType,
    template.key,
    template.schemaVersion
  );
  if (registry.has(id)) {
    throw new Error(`Duplicate record template ${id}`);
  }
  registry.set(id, template);
}

export const findRecordTemplate = (
  recordType: RecordType,
  key: string,
  schemaVersion: number
): RecordTemplate | undefined =>
  registry.get(registryKey(recordType, key, schemaVersion));

/** The newest version of each template, for "which form do I show". */
export const isLatestVersion = (template: RecordTemplate): boolean =>
  RECORD_TEMPLATES.every(
    (other) =>
      other.recordType !== template.recordType ||
      other.key !== template.key ||
      other.schemaVersion <= template.schemaVersion
  );
