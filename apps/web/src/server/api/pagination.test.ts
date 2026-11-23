import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ValidationError } from "./errors";
import {
  decodeCursor,
  decodeTimeIdCursor,
  encodeCursor,
  encodeTimeIdCursor,
  paginationQueryShape,
  timeIdKeysetWhere,
  toPage,
} from "./pagination";

describe("pagination", () => {
  const schema = z.object(paginationQueryShape);

  it("defaults the limit to 50 and caps it at 200", () => {
    expect(schema.parse({}).limit).toBe(50);
    expect(schema.parse({ limit: "200" }).limit).toBe(200);
    expect(schema.safeParse({ limit: "201" }).success).toBe(false);
    expect(schema.safeParse({ limit: "0" }).success).toBe(false);
  });

  it("round-trips opaque cursors and rejects tampered ones", () => {
    const at = new Date("2026-11-23T08:30:00.123Z");
    expect(decodeTimeIdCursor(encodeTimeIdCursor(at, "abc"))).toEqual({
      at,
      id: "abc",
    });
    expect(
      decodeCursor(encodeCursor({ n: 1 }), z.object({ n: z.number() }))
    ).toEqual({ n: 1 });
    expect(() => decodeTimeIdCursor("not-a-cursor")).toThrow(ValidationError);
    expect(() => decodeTimeIdCursor(encodeCursor(["x", "y"]))).toThrow(
      ValidationError
    );
  });

  it("builds a keyset filter after the cursor", () => {
    const at = new Date("2026-11-23T08:30:00Z");
    expect(timeIdKeysetWhere("createdAt", undefined, "desc")).toEqual({});
    expect(
      timeIdKeysetWhere("createdAt", encodeTimeIdCursor(at, "m"), "desc")
    ).toEqual({
      OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: "m" } }],
    });
    expect(
      timeIdKeysetWhere("createdAt", encodeTimeIdCursor(at, "m"), "asc")
    ).toEqual({
      OR: [{ createdAt: { gt: at } }, { createdAt: at, id: { gt: "m" } }],
    });
  });

  it("keeps limit rows and sets nextCursor only when there are more", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(toPage(rows, 2, (row) => row.id)).toEqual({
      data: [{ id: "a" }, { id: "b" }],
      nextCursor: "b",
    });
    expect(toPage(rows, 3, (row) => row.id).nextCursor).toBeNull();
    expect(
      toPage(
        rows,
        3,
        (row) => row.id,
        (row) => row.id
      ).data
    ).toEqual(["a", "b", "c"]);
  });
});
