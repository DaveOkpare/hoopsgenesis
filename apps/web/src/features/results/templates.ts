/*
 * Athletic result templates (CO-8). The form on "Log a result" is built from one of
 * these: which field of the record's `data` holds the score (the big box), how it is
 * bounded, the fields every record of the template carries, and any other fields the
 * template asks for (drawn under Date and Session).
 *
 * How a template is drawn (3P1-0 basketball, IEF-0 football): one chip per template, or
 * per metric when a template measures several things. A "made of N" drill draws
 * "MADE / 8 of 10" (football says "SCORED"); a measured value draws the number and its
 * unit. Nothing here depends on the sport: the server does not store a team's sport, so
 * the chips are simply the templates the server returns.
 *
 * Real mode: the server's athletic templates (GET /record-templates, app config on the
 * server), so `data` always validates there. Preview mode: the drills drawn in the
 * designs (DESIGN_TEMPLATES), which the server does not know; they exist only so the
 * design screenshots stay as drawn.
 */

/** A template chip's id: a design drill ("free_throws") or "<key>[.<field>]". */
export type DrillId = string;

/** A non-score field the template asks for (sprint "Timing", "Wind", "Notes"). */
export interface ExtraField {
  /** Hint under the label (the schema's description). */
  description: string | null;
  integer: boolean;
  kind: "choice" | "number" | "text";
  label: string;
  max: number | null;
  /** Longest text allowed. */
  maxLength: number | null;
  min: number | null;
  /** The `data` key. */
  name: string;
  /** Choice values, as stored. */
  options: string[];
  required: boolean;
}

export interface ResultTemplate {
  /** Fixed number of attempts for "made of N" drills. */
  attempts?: number;
  /** Lower is better for timed drills. */
  better: "higher" | "lower";
  /** Other fields of the template, drawn under Date and Session. */
  extras: ExtraField[];
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
  /** Label above the score box ("Made", "Scored", "Time", "Push-ups"). */
  scoreLabel: string;
  /** Shown after the number ("seconds", "cm"); null for none. */
  unit: string | null;
}

const ATTEMPTS = 10;
const MAX_DRILL_SECONDS = 600;
const MAX_TOUCHES = 1000;

function madeDrill(
  id: string,
  label: string,
  lowerLabel: string,
  scoreLabel: string
): ResultTemplate {
  return {
    id,
    key: null,
    schemaVersion: 1,
    label,
    lowerLabel,
    scoreLabel,
    metric: "made",
    attempts: ATTEMPTS,
    better: "higher",
    unit: null,
    integer: true,
    min: 0,
    max: ATTEMPTS,
    field: "made",
    fixed: { drill: id, attempts: ATTEMPTS },
    extras: [],
  };
}

/** The basketball drills in the designs (3P1-0). Preview only. */
export const DESIGN_TEMPLATES: ResultTemplate[] = [
  madeDrill("free_throws", "Free throws", "free throws", "Made"),
  madeDrill("three_point", "3-pt shooting", "3-pt shooting", "Made"),
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
    extras: [],
  },
];

/** The football drills in the designs (IEF-0, Girls U16). Preview only. */
export const DESIGN_FOOTBALL_TEMPLATES: ResultTemplate[] = [
  madeDrill("penalties", "Penalties", "penalties", "Scored"),
  {
    id: "juggling",
    key: null,
    schemaVersion: 1,
    label: "Juggling",
    lowerLabel: "juggling",
    scoreLabel: "Touches",
    metric: "measure",
    better: "higher",
    unit: null,
    integer: true,
    min: 0,
    max: MAX_TOUCHES,
    field: "touches",
    fixed: { drill: "juggling" },
    extras: [],
  },
];

export function isDrillId(value: unknown): value is DrillId {
  return typeof value === "string" && value.length > 0;
}

/** Result `data` as stored on an athletic record. */
export type AthleticData = Readonly<Record<string, unknown>>;

/** Raw form values of the extra fields, by name ("" = left empty). */
export type ExtraValues = Record<string, string>;

/** Starting values: a required choice takes its first option, the rest start empty. */
export function extraDefaults(template: ResultTemplate): ExtraValues {
  return Object.fromEntries(
    template.extras.map((extra) => [
      extra.name,
      extra.kind === "choice" && extra.required ? (extra.options[0] ?? "") : "",
    ])
  );
}

/** `data` for a new record: the fixed fields, the score and the filled-in extras. */
export function buildResultData(
  template: ResultTemplate,
  score: number,
  extras: ExtraValues = {}
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    ...template.fixed,
    [template.field]: score,
  };
  for (const extra of template.extras) {
    const raw = extras[extra.name]?.trim() ?? "";
    if (raw !== "") {
      data[extra.name] = extra.kind === "number" ? Number(raw) : raw;
    }
  }
  return data;
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
  penalties: "Penalties",
  juggling: "Juggling",
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
    if (typeof data.touches === "number") {
      return `${label} · ${data.touches} touches`;
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

interface SchemaProperty {
  const?: unknown;
  description?: string;
  enum?: unknown[];
  maximum?: number;
  maxLength?: number;
  minimum?: number;
  title?: string;
  type?: string;
}

/** GET /record-templates item (the fields used here). */
export interface ServerRecordTemplate {
  jsonSchema: {
    properties?: Record<string, SchemaProperty>;
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

/** A field the form can draw, or null (arrays and objects are not drawn). */
function toExtra(
  name: string,
  property: SchemaProperty,
  required: boolean
): ExtraField | null {
  const base = {
    name,
    label: property.title ?? humanize(name),
    description: property.description ?? null,
    required,
    min: property.minimum ?? null,
    max: property.maximum ?? null,
    maxLength: property.maxLength ?? null,
    integer: property.type === "integer",
    options: [] as string[],
  };
  if (property.enum?.length) {
    return { ...base, kind: "choice", options: property.enum.map(String) };
  }
  if (property.type === "number" || property.type === "integer") {
    return { ...base, kind: "number" };
  }
  if (property.type === "string") {
    return { ...base, kind: "text" };
  }
  return null;
}

/**
 * Everything a template's chip fixes or asks for besides its score: `const` fields are
 * fixed, the template's other metrics are left to their own chips, and the rest become
 * extra fields. null when a required field can't be drawn, so the chip is left out.
 */
function chipShape(
  template: ServerRecordTemplate,
  field: string
): { fixed: Record<string, unknown>; extras: ExtraField[] } | null {
  const properties = template.jsonSchema.properties ?? {};
  const required = new Set(template.jsonSchema.required ?? []);
  const metricFields = new Set(template.metrics.map((m) => m.field));
  const fixed: Record<string, unknown> = { template: template.key };
  const extras: ExtraField[] = [];
  for (const [name, property] of Object.entries(properties)) {
    if (name === "template" || name === field || metricFields.has(name)) {
      continue;
    }
    if (property.const !== undefined) {
      fixed[name] = property.const;
      continue;
    }
    const extra = toExtra(name, property, required.has(name));
    if (extra) {
      extras.push(extra);
    } else if (required.has(name)) {
      return null;
    }
  }
  return { fixed, extras };
}

/** One chip per metric of each latest athletic template the form can fill. */
export function chipsFromServer(
  templates: ServerRecordTemplate[]
): ResultTemplate[] {
  return templates
    .filter((t) => t.recordType === "athletic" && t.latest)
    .flatMap((t) =>
      t.metrics.flatMap((metric): ResultTemplate[] => {
        const shape = chipShape(t, metric.field);
        if (!shape) {
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
            fixed: shape.fixed,
            extras: shape.extras,
          },
        ];
      })
    );
}
