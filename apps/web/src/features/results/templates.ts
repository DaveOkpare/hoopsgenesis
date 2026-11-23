/*
 * Athletic result templates (CO-8). The form on "Log a result" is built from one of
 * these: which field of the record's `data` holds the score, how it is bounded, and the
 * fields every record of the template carries.
 *
 * Real mode: the server's athletic templates (GET /record-templates, app config on the
 * server), one chip per metric, so `data` always validates there. Preview mode: the
 * basketball drills drawn in the designs (DESIGN_TEMPLATES), which the server does not
 * know; they exist only so the design screenshots stay as drawn.
 */

/** A template chip's id: a design drill ("free_throws") or "<key>.<field>". */
export type DrillId = string;

export interface ResultTemplate {
  /** Fixed number of attempts for "made of N" drills. */
  attempts?: number;
  /** Lower is better for timed drills. */
  better: "higher" | "lower";
  /** The `data` field that holds the score. */
  field: string;
  /** Fields every record of this template carries (`template`, `attempts`, ...). */
  fixed: Record<string, unknown>;
  id: DrillId;
  /** Whole numbers only. */
  integer: boolean;
  /** Server template key; null for the design drills (preview only). */
  key: string | null;
  label: string;
  /** Plural used in "Jean's recent free throws". */
  lowerLabel: string;
  max: number;
  /** "made": made of `attempts`; "measure": a measured value in `unit`. */
  metric: "made" | "measure";
  min: number;
  schemaVersion: number;
  /** Label above the score box ("Made", "Time", "Push-ups"). */
  scoreLabel: string;
  /** Shown after the number ("seconds", "cm"); null for none. */
  unit: string | null;
}

const ATTEMPTS = 10;
const MAX_DRILL_SECONDS = 600;

/** The basketball drills in the designs (3P1-0). Preview only. */
export const DESIGN_TEMPLATES: ResultTemplate[] = [
  {
    id: "free_throws",
    key: null,
    schemaVersion: 1,
    label: "Free throws",
    lowerLabel: "free throws",
    scoreLabel: "Made",
    metric: "made",
    attempts: ATTEMPTS,
    better: "higher",
    unit: null,
    integer: true,
    min: 0,
    max: ATTEMPTS,
    field: "made",
    fixed: { drill: "free_throws", attempts: ATTEMPTS },
  },
  {
    id: "three_point",
    key: null,
    schemaVersion: 1,
    label: "3-pt shooting",
    lowerLabel: "3-pt shooting",
    scoreLabel: "Made",
    metric: "made",
    attempts: ATTEMPTS,
    better: "higher",
    unit: null,
    integer: true,
    min: 0,
    max: ATTEMPTS,
    field: "made",
    fixed: { drill: "three_point", attempts: ATTEMPTS },
  },
  {
    id: "dribbling",
    key: null,
    schemaVersion: 1,
    label: "Dribbling",
    lowerLabel: "dribbling times",
    scoreLabel: "Time",
    metric: "measure",
    better: "lower",
    unit: "seconds",
    integer: true,
    min: 1,
    max: MAX_DRILL_SECONDS,
    field: "seconds",
    fixed: { drill: "dribbling" },
  },
];

export function isDrillId(value: unknown): value is DrillId {
  return typeof value === "string" && value.length > 0;
}

/** Result `data` as stored on an athletic record. */
export type AthleticData = Readonly<Record<string, unknown>>;

/** `data` for a new record: the template's fixed fields plus the score. */
export function buildResultData(
  template: ResultTemplate,
  score: number
): Record<string, unknown> {
  return { ...template.fixed, [template.field]: score };
}

/** The number a result is judged by (NaN when the record lacks the field). */
export function resultScore(
  data: AthleticData,
  template: ResultTemplate
): number {
  return Number(data[template.field]);
}

const DESIGN_LABELS: Record<string, string> = {
  free_throws: "Free throws",
  three_point: "3-pt shooting",
  dribbling: "Dribbling",
};

const TEMPLATE_LABELS: Record<string, string> = {
  sprint_100m: "100 m sprint",
  fitness_test: "Fitness test",
};

/** How the server templates' metric fields read in one line. */
const FIELD_FORMAT: Record<string, (value: number) => string> = {
  timeSeconds: (v) => `${v} s`,
  beepTestLevel: (v) => `level ${v}`,
  pushUps: (v) => `${v} push-ups`,
  sitUps: (v) => `${v} sit-ups`,
  verticalJumpCm: (v) => `${v} cm jump`,
  plankSeconds: (v) => `${v} s plank`,
};

function humanize(key: string): string {
  const words = key.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "Free throws · 7 of 10", "Dribbling · 41 s", "100 m sprint · 12.4 s". */
export function formatResult(data: AthleticData): string {
  if (typeof data.drill === "string") {
    const label = DESIGN_LABELS[data.drill] ?? data.drill;
    if (typeof data.seconds === "number") {
      return `${label} · ${data.seconds} s`;
    }
    return `${label} · ${data.made} of ${data.attempts}`;
  }
  const key = typeof data.template === "string" ? data.template : "";
  const label = TEMPLATE_LABELS[key] ?? (key ? humanize(key) : "Result");
  const parts = Object.entries(FIELD_FORMAT).flatMap(([field, format]) =>
    typeof data[field] === "number" ? [format(data[field] as number)] : []
  );
  return parts.length ? `${label} · ${parts.join(", ")}` : label;
}

// ---------------------------------------------------------------- server templates

/** GET /record-templates item (the fields used here). */
export interface ServerRecordTemplate {
  jsonSchema: {
    properties?: Record<
      string,
      {
        const?: unknown;
        enum?: unknown[];
        maximum?: number;
        minimum?: number;
        type?: string;
      }
    >;
    required?: string[];
  };
  key: string;
  label: string;
  latest: boolean;
  metrics: {
    better: "higher" | "lower";
    field: string;
    label: string;
    unit: string | null;
  }[];
  recordType: "academic" | "athletic";
  schemaVersion: number;
}

const DEFAULT_MAX = 100_000;

/**
 * Fields a template requires besides `template` and the score. A field with a fixed
 * set of values takes the first one (e.g. a sprint's `timing` becomes "hand");
 * null when a required field can't be filled, so the chip is left out.
 */
function requiredDefaults(
  template: ServerRecordTemplate,
  field: string
): Record<string, unknown> | null {
  const properties = template.jsonSchema.properties ?? {};
  const fixed: Record<string, unknown> = { template: template.key };
  for (const name of template.jsonSchema.required ?? []) {
    if (name === "template" || name === field) {
      continue;
    }
    const property = properties[name];
    if (property?.const !== undefined) {
      fixed[name] = property.const;
    } else if (property?.enum?.length) {
      fixed[name] = property.enum[0];
    } else {
      return null;
    }
  }
  return fixed;
}

/** One chip per metric of each latest athletic template the form can fill. */
export function chipsFromServer(
  templates: ServerRecordTemplate[]
): ResultTemplate[] {
  return templates
    .filter((t) => t.recordType === "athletic" && t.latest)
    .flatMap((t) =>
      t.metrics.flatMap((metric): ResultTemplate[] => {
        const fixed = requiredDefaults(t, metric.field);
        if (!fixed) {
          return [];
        }
        const property = t.jsonSchema.properties?.[metric.field];
        const label = t.metrics.length > 1 ? metric.label : t.label;
        return [
          {
            id: t.metrics.length > 1 ? `${t.key}.${metric.field}` : t.key,
            key: t.key,
            schemaVersion: t.schemaVersion,
            label,
            lowerLabel: label.toLowerCase(),
            scoreLabel: metric.label,
            metric: "measure",
            better: metric.better,
            unit: metric.unit,
            integer: property?.type === "integer",
            min: property?.minimum ?? 0,
            max: property?.maximum ?? DEFAULT_MAX,
            field: metric.field,
            fixed,
          },
        ];
      })
    );
}
