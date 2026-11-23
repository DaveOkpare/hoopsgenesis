/**
 * Cursor pagination: `?limit=50&cursor=<opaque>` in, `{ data, nextCursor }`
 * out. Default 50, max 200. `nextCursor` is null on the last page.
 *
 * Ordering must be stable and unique, so always end `orderBy` with `id`.
 * For the common "newest first" list, use the time + id helpers:
 *
 * ```ts
 * const { limit, cursor } = query; // query schema spreads paginationQueryShape
 * const rows = await db.thing.findMany({
 *   where: { AND: [filters, timeIdKeysetWhere("createdAt", cursor, "desc")] },
 *   orderBy: [{ createdAt: "desc" }, { id: "desc" }],
 *   take: limit + 1,
 * });
 * return json(toPage(rows, limit, (row) => encodeTimeIdCursor(row.createdAt, row.id)));
 * ```
 *
 * For another sort key, use `encodeCursor` / `decodeCursor` with your own
 * payload schema and build the keyset `where` the same way.
 */
import { z } from "zod";

import { ValidationError } from "./errors";

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;
const MAX_CURSOR_LENGTH = 512;

/** Spread into a query schema: `z.object({ ...paginationQueryShape, ... })`. */
export const paginationQueryShape = {
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_LIMIT)
    .default(DEFAULT_PAGE_LIMIT),
  cursor: z.string().min(1).max(MAX_CURSOR_LENGTH).optional(),
};

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

/** Opaque cursor: base64url JSON. Clients must not parse it. */
export const encodeCursor = (payload: unknown): string =>
  Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

/** Decodes a cursor made by `encodeCursor`; a bad cursor is a 400. */
export const decodeCursor = <S extends z.ZodType>(
  cursor: string,
  schema: S
): z.output<S> => {
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch (error) {
    throw new ValidationError("Invalid cursor", {
      code: "invalid_cursor",
      cause: error,
    });
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ValidationError("Invalid cursor", { code: "invalid_cursor" });
  }
  return result.data;
};

const timeIdCursorSchema = z.tuple([z.iso.datetime(), z.string().min(1)]);

export const encodeTimeIdCursor = (at: Date, id: string): string =>
  encodeCursor([at.toISOString(), id]);

export const decodeTimeIdCursor = (
  cursor: string
): { at: Date; id: string } => {
  const [at, id] = decodeCursor(cursor, timeIdCursorSchema);
  return { at: new Date(at), id };
};

type Comparison = "lt" | "gt";

/**
 * Keyset `where` for rows after `cursor` when ordered by `[field, id]`.
 * Returns `{}` (no filter) without a cursor. Put it in `AND` with the filters.
 */
export const timeIdKeysetWhere = <Field extends string>(
  field: Field,
  cursor: string | undefined,
  direction: "asc" | "desc"
):
  | Record<string, never>
  | {
      OR: [
        Record<Field, Partial<Record<Comparison, Date>>>,
        Record<Field, Date> & { id: Partial<Record<Comparison, string>> },
      ];
    } => {
  if (!cursor) {
    return {};
  }
  const { at, id } = decodeTimeIdCursor(cursor);
  const comparison: Comparison = direction === "desc" ? "lt" : "gt";
  return {
    OR: [
      { [field]: { [comparison]: at } } as Record<
        Field,
        Partial<Record<Comparison, Date>>
      >,
      { [field]: at, id: { [comparison]: id } } as Record<Field, Date> & {
        id: Partial<Record<Comparison, string>>;
      },
    ],
  };
};

/**
 * Turns `limit + 1` fetched rows into a page: keeps `limit` rows and makes
 * `nextCursor` from the last one kept when there are more.
 */
export const toPage = <Row, Item = Row>(
  rows: readonly Row[],
  limit: number,
  cursorFor: (row: Row) => string,
  serialize: (row: Row) => Item = (row) => row as unknown as Item
): Page<Item> => {
  const hasMore = rows.length > limit;
  const kept = hasMore ? rows.slice(0, limit) : rows;
  const last = kept.at(-1);
  return {
    data: kept.map(serialize),
    nextCursor: hasMore && last !== undefined ? cursorFor(last) : null,
  };
};
