/**
 * Request parsing for `/api/v1` handlers. Every helper validates with Zod,
 * rejects unknown keys at the top level (use `z.strictObject` for nested
 * objects too), and throws `ValidationError` (400) with the issues in
 * `details.issues`.
 */
import { z } from "zod";

import { ValidationError } from "./errors";
import { formatZodIssues } from "./handler";

/** Longest id accepted in paths, queries and bodies. */
const MAX_ID_LENGTH = 128;
/** Bodies larger than this are rejected before parsing. */
const MAX_BODY_BYTES = 1_000_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
/** Up to 12 whole digits and 2 decimals, matching numeric(14, 2). */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/**
 * Ids are text (Better Auth ids, cuid for app tables), not UUIDs: accept any
 * non-empty string of sane length.
 */
export const idSchema = z.string().trim().min(1).max(MAX_ID_LENGTH);

/** A calendar date, `YYYY-MM-DD`, that actually exists (no 2026-02-30). */
export const isoDateSchema = z
  .string()
  .regex(ISO_DATE_PATTERN, "Expected a date as YYYY-MM-DD")
  .refine((value) => {
    // Zod runs refinements even after the regex fails, so guard here too.
    const time = Date.parse(`${value}T00:00:00Z`);
    return (
      Number.isFinite(time) && new Date(time).toISOString().startsWith(value)
    );
  }, "Not a real calendar date");

/** A local time of day, `HH:MM` or `HH:MM:SS`. */
export const timeOfDaySchema = z
  .string()
  .regex(TIME_PATTERN, "Expected a time as HH:MM");

/** An ISO 8601 timestamp with an offset or Z; parsed to a Date. */
export const timestampSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));

/** Money as a decimal string above zero, e.g. "15000.00". Never a number. */
export const moneyAmountSchema = z
  .string()
  .regex(MONEY_PATTERN, 'Expected a decimal string such as "15000.00"')
  .refine((value) => Number(value) > 0, "Amount must be above 0");

/** ISO 4217 code, upper case. */
export const currencySchema = z
  .string()
  .regex(CURRENCY_PATTERN, "Expected an ISO 4217 code such as NGN");

const toValidationError = (error: z.ZodError, where: string): ValidationError =>
  new ValidationError(`Invalid ${where}`, {
    details: { issues: formatZodIssues(error) },
  });

const parseStrict = <S extends z.ZodObject>(
  schema: S,
  value: unknown,
  where: string
): z.output<S> => {
  const result = schema.strict().safeParse(value);
  if (!result.success) {
    throw toValidationError(result.error, where);
  }
  return result.data as z.output<S>;
};

/**
 * Reads the request body as JSON. Requires `content-type: application/json`
 * (which also stops cross-site form posts riding on the session cookie).
 * An empty body is `undefined`.
 */
export const readJsonBody = async (request: Request): Promise<unknown> => {
  const contentType = request.headers.get("content-type") ?? "";
  const text = await request.text();
  if (text.length === 0) {
    return;
  }
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ValidationError("Send the body as application/json", {
      code: "unsupported_content_type",
    });
  }
  if (text.length > MAX_BODY_BYTES) {
    throw new ValidationError("Request body is too large", {
      code: "body_too_large",
    });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ValidationError("Request body is not valid JSON", {
      code: "invalid_json",
      cause: error,
    });
  }
};

/** Validates an already-read JSON body (see `readJsonBody`). */
export const parseBody = <S extends z.ZodObject>(
  schema: S,
  body: unknown
): z.output<S> => parseStrict(schema, body ?? {}, "body");

/**
 * Validates the query string. Every value arrives as a string, so use
 * `z.coerce.number()` etc. for non-strings. A key given twice becomes an
 * array of strings.
 */
export const parseQuery = <S extends z.ZodObject>(
  schema: S,
  request: Request
): z.output<S> => {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    const existing = query[key];
    if (existing === undefined) {
      query[key] = value;
    } else {
      query[key] = Array.isArray(existing)
        ? [...existing, value]
        : [existing, value];
    }
  }
  return parseStrict(schema, query, "query");
};

/**
 * Validates path params, e.g. `parseParams(z.object({ id: idSchema }), params)`.
 * Not strict: the router decides which params exist (a nested route also
 * carries its parents' params, such as `academyId`), not the client.
 */
export const parseParams = <S extends z.ZodObject>(
  schema: S,
  params: Readonly<Record<string, string | undefined>>
): z.output<S> => {
  const result = schema.safeParse(params);
  if (!result.success) {
    throw toValidationError(result.error, "path");
  }
  return result.data as z.output<S>;
};
