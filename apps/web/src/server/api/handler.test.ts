import { describe, expect, it } from "vitest";

import { apiHandler, json } from "./handler";
import { unhandledApiResponse } from "./route-guard";

const URL_BASE = "http://localhost:3001/api/v1/things";

/** A handler that never reads its body, like POST /attendance/:id/verify. */
const bodyless = apiHandler(() => Promise.resolve(json({ data: "ran" })));
const webhookLike = apiHandler(() => Promise.resolve(json({ data: "ran" })), {
  anyContentType: true,
});

const send = (
  method: string,
  body: string | null,
  contentType?: string,
  handler = bodyless
) =>
  handler({
    request: new Request(URL_BASE, {
      method,
      headers: contentType ? { "content-type": contentType } : {},
      body,
    }),
    params: {},
  });

describe("apiHandler: JSON or empty bodies on state-changing methods", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "%s refuses form, multipart and text bodies (cross-site forms)",
    async (method) => {
      for (const [body, type] of [
        ["a=1", "application/x-www-form-urlencoded"],
        ["", "application/x-www-form-urlencoded"],
        ["--x--", "multipart/form-data; boundary=x"],
        ["hello", "text/plain"],
      ] as const) {
        // biome-ignore lint/performance/noAwaitInLoops: one request at a time
        const response = await send(method, body, type);
        expect(response.status).toBe(400);
        expect((await response.json()).error.code).toBe(
          "unsupported_content_type"
        );
      }
    }
  );

  it("lets JSON and truly empty bodies through, and leaves GET alone", async () => {
    expect((await send("POST", "{}", "application/json")).status).toBe(200);
    expect(
      (await send("POST", "", "application/json; charset=utf-8")).status
    ).toBe(200);
    expect((await send("POST", null)).status).toBe(200);
    expect((await send("DELETE", null)).status).toBe(200);
    expect((await send("GET", null, "text/plain")).status).toBe(200);
  });

  it("the webhook opt-out accepts any content type", async () => {
    const response = await send("POST", "a=1", "text/plain", webhookLike);
    expect(response.status).toBe(200);
  });
});

describe("route guard: 404 and 405 in the JSON envelope", () => {
  it("405 with Allow for a method the route has no handler for", async () => {
    const response = await unhandledApiResponse(
      "PUT",
      "/api/v1/academies/a/fees/b"
    );
    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("GET, HEAD");
    expect(response?.headers.get("content-type")).toContain("application/json");
    expect((await (response as Response).json()).error.code).toBe(
      "method_not_allowed"
    );
    const scan = await unhandledApiResponse("GET", "/api/v1/attendance/scan");
    expect(scan?.status).toBe(405);
    expect(scan?.headers.get("allow")).toBe("POST");
  });

  it("404 for an unknown /api/v1 path", async () => {
    for (const path of [
      "/api/v1",
      "/api/v1/nope",
      "/api/v1/academies/a/nope/deeper",
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one path at a time
      const response = await unhandledApiResponse("GET", path);
      expect({ path, status: response?.status }).toEqual({
        path,
        status: 404,
      });
      expect((await (response as Response).json()).error.code).toBe(
        "not_found"
      );
    }
  });

  it("lets handled methods through (HEAD rides on GET)", async () => {
    expect(
      await unhandledApiResponse("GET", "/api/v1/academies/a/fees/b")
    ).toBeNull();
    expect(
      await unhandledApiResponse("HEAD", "/api/v1/academies/a/dashboard")
    ).toBeNull();
    expect(
      await unhandledApiResponse("POST", "/api/v1/attendance/scan")
    ).toBeNull();
    expect(
      await unhandledApiResponse(
        "GET",
        "/api/v1/admin/academies/a/fees/outstanding"
      )
    ).toBeNull();
  });
});
