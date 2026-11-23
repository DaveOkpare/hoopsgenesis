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

/** The "What Aline entered" rows. */
export function recordFields(
  item: ReviewItem
): { label: string; value: string }[] {
  const { data } = item;
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
