/* How a record reads in the review queue: titles, subtitles and the entered fields. */
import type { ReviewItem } from "@/features/records/queries";
import { firstName, formatDayMonth } from "@/lib/format";

const DRILL_LABEL: Record<string, string> = {
  free_throws: "Free throws",
  three_point: "Three-pointers",
  penalty_kicks: "Penalty kicks",
};

const KIND_LABEL: Record<string, string> = {
  report_card: "Report card",
};

/** The server's record templates (`data.template`, see GET /record-templates). */
const TEMPLATE_LABEL: Record<string, string> = {
  report_card: "Report card",
  sprint_100m: "100 m sprint",
  fitness_test: "Fitness test",
};

const MS_PER_DAY = 86_400_000;

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function humanise(value: string): string {
  return capitalise(value.replaceAll("_", " "));
}

function str(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  return typeof value === "number" ? String(value) : null;
}

/** "Report card", "Free throws". */
export function recordTitle(item: ReviewItem): string {
  const { data } = item;
  const template = str(data.template);
  if (template) {
    return TEMPLATE_LABEL[template] ?? humanise(template);
  }
  if (item.recordType === "academic") {
    const kind = str(data.kind);
    return kind ? (KIND_LABEL[kind] ?? humanise(kind)) : "Academic record";
  }
  const drill = str(data.drill);
  return drill ? (DRILL_LABEL[drill] ?? humanise(drill)) : "Athletic result";
}

/** "Report card · Academic · U14", "Free throws · Basketball · U16". */
export function recordSubtitle(item: ReviewItem): string {
  const category =
    item.recordType === "academic"
      ? "Academic"
      : capitalise(str(item.data.sport) ?? "Athletic");
  return [recordTitle(item), category, item.student.teamName]
    .filter(Boolean)
    .join(" · ");
}

/** True when the student uploaded it themselves (vs. a coach recording a result). */
export function isSelfUpload(item: ReviewItem): boolean {
  return item.recordedBy === item.studentId;
}

export function recordFileName(item: ReviewItem): string | null {
  return str(item.data.fileName);
}

/** "Uploaded by Aline on 20 Nov · report-card-term3.pdf" */
export function recordProvenance(item: ReviewItem, timeZone: string): string {
  const verb = isSelfUpload(item) ? "Uploaded" : "Recorded";
  const file = recordFileName(item);
  return `${verb} by ${firstName(item.recordedByName)} on ${formatDayMonth(item.recordedOn, timeZone)}${file ? ` · ${file}` : ""}`;
}

function num(value: unknown, unit = ""): string | null {
  return typeof value === "number" ? `${value}${unit}` : null;
}

function subjectList(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const rows = value as { subject?: unknown; grade?: unknown }[];
  const text = rows
    .map((row) => `${str(row.subject) ?? ""} ${str(row.grade) ?? ""}`.trim())
    .filter(Boolean)
    .join(", ");
  return text || null;
}

/** Rows for the server's templates (report_card, sprint_100m, fitness_test). */
function templateFields(
  template: string,
  data: Record<string, unknown>
): { label: string; value: string | null }[] {
  switch (template) {
    case "report_card":
      return [
        { label: "School", value: str(data.schoolName) },
        { label: "Term", value: str(data.term) },
        { label: "School year", value: str(data.schoolYear) },
        { label: "Grades", value: subjectList(data.subjects) },
        { label: "Average", value: num(data.averageScore, "%") },
        { label: "Notes", value: str(data.notes) },
      ];
    case "sprint_100m":
      return [
        { label: "Time", value: num(data.timeSeconds, " s") },
        {
          label: "Timing",
          value: str(data.timing) && humanise(String(data.timing)),
        },
        { label: "Wind", value: num(data.windMps, " m/s") },
        { label: "Notes", value: str(data.notes) },
      ];
    case "fitness_test":
      return [
        { label: "Beep test level", value: num(data.beepTestLevel) },
        { label: "Push-ups (1 min)", value: num(data.pushUps) },
        { label: "Sit-ups (1 min)", value: num(data.sitUps) },
        { label: "Vertical jump", value: num(data.verticalJumpCm, " cm") },
        { label: "Plank", value: num(data.plankSeconds, " s") },
        { label: "Notes", value: str(data.notes) },
      ];
    default:
      return Object.entries(data)
        .filter(([key]) => key !== "template")
        .map(([key, value]) => ({ label: humanise(key), value: str(value) }));
  }
}

/** The "What Aline entered" rows. */
export function recordFields(
  item: ReviewItem
): { label: string; value: string }[] {
  const { data } = item;
  const template = str(data.template);
  if (template) {
    return templateFields(template, data).filter(
      (field): field is { label: string; value: string } => field.value !== null
    );
  }
  const fields: { label: string; value: string | null }[] =
    item.recordType === "academic"
      ? [
          { label: "School", value: str(data.school) },
          { label: "Term", value: str(data.term) },
          {
            label: "Average",
            value:
              typeof data.averagePercent === "number"
                ? `${data.averagePercent}%`
                : null,
          },
          {
            label: "Position in class",
            value:
              typeof data.position === "number" &&
              typeof data.classSize === "number"
                ? `${data.position} of ${data.classSize}`
                : null,
          },
        ]
      : [
          {
            label: "Sport",
            value: str(data.sport) && capitalise(String(data.sport)),
          },
          { label: "Drill", value: recordTitle(item) },
          {
            label: "Result",
            value:
              typeof data.made === "number" && typeof data.attempts === "number"
                ? `${data.made} of ${data.attempts}`
                : null,
          },
        ];
  return fields.filter(
    (field): field is { label: string; value: string } => field.value !== null
  );
}

/** "Today", "Yesterday", "3 days" since it was uploaded. */
export function waitingLabel(
  createdAt: string,
  now: Date,
  timeZone: string
): string {
  const day = (value: Date) =>
    Date.parse(
      `${new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value)}T00:00:00Z`
    ) / MS_PER_DAY;
  const diff = Math.max(0, day(now) - day(new Date(createdAt)));
  if (diff === 0) {
    return "Today";
  }
  return diff === 1 ? "Yesterday" : `${diff} days`;
}
