import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ValidationError } from "./errors";
import {
  idSchema,
  isoDateSchema,
  moneyAmountSchema,
  parseBody,
  parseParams,
  parseQuery,
  readJsonBody,
} from "./validation";

const jsonRequest = (body: string, contentType = "application/json") =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });

const catchError = (run: () => unknown): ValidationError => {
  try {
    run();
  } catch (error) {
    if (error instanceof ValidationError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a ValidationError");
};

describe("validation helpers", () => {
  const schema = z.object({ name: z.string(), amount: moneyAmountSchema });

  it("rejects unknown body keys with the issues in details", () => {
    const error = catchError(() =>
      parseBody(schema, { name: "x", amount: "1.00", recordedBy: "u" })
    );
    expect(error.status).toBe(400);
    expect(error.code).toBe("validation_failed");
    expect(error.details).toEqual({
      issues: [
        expect.objectContaining({ code: "unrecognized_keys", path: "" }),
      ],
    });
  });

  it("accepts money only as a positive decimal string", () => {
    expect(parseBody(schema, { name: "x", amount: "15000.00" }).amount).toBe(
      "15000.00"
    );
    for (const amount of [15_000, "15000.001", "0", "-1", "1e3"]) {
      expect(() => parseBody(schema, { name: "x", amount })).toThrow(
        ValidationError
      );
    }
  });

  it("rejects unknown query keys and keeps repeated keys as arrays", () => {
    const query = z.object({ teamId: z.array(idSchema).optional() });
    const request = new Request("http://localhost/x?teamId=a&teamId=b");
    expect(parseQuery(query, request)).toEqual({ teamId: ["a", "b"] });
    expect(() =>
      parseQuery(query, new Request("http://localhost/x?other=1"))
    ).toThrow(ValidationError);
  });

  it("checks params without rejecting parent route params", () => {
    expect(
      parseParams(z.object({ id: idSchema }), { academyId: "a", id: "b" })
    ).toEqual({ id: "b" });
    expect(() => parseParams(z.object({ id: idSchema }), { id: "" })).toThrow(
      ValidationError
    );
  });

  it("validates real calendar dates", () => {
    expect(isoDateSchema.safeParse("2028-02-29").success).toBe(true);
    expect(isoDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(isoDateSchema.safeParse("2026-2-3").success).toBe(false);
  });

  it("reads JSON bodies and rejects bad ones", async () => {
    await expect(readJsonBody(jsonRequest('{"a":1}'))).resolves.toEqual({
      a: 1,
    });
    await expect(readJsonBody(jsonRequest(""))).resolves.toBeUndefined();
    await expect(readJsonBody(jsonRequest("{"))).rejects.toMatchObject({
      code: "invalid_json",
    });
    await expect(
      readJsonBody(jsonRequest("a=1", "application/x-www-form-urlencoded"))
    ).rejects.toMatchObject({
      code: "unsupported_content_type",
    });
  });
});
