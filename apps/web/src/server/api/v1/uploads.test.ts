import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMemoryStorage } from "../storage/memory-storage";
import { parseTmpKey, setStorageForTesting } from "../storage/storage";
import {
  addMember,
  cleanup,
  createTestAcademy,
  createTestUser,
  type TestAcademy,
  type TestUser,
} from "../testing/fixtures";
import { callApi } from "./records-fixtures";
import { createUpload } from "./uploads";

const MEMORY_UPLOAD_URL = /^memory:\/\/upload\//;
const PNG_KEY = /\.png$/;
const TEN_MB = 10 * 1024 * 1024;
const UPLOAD_SECONDS = 600;

let academy: TestAcademy;
let student: TestUser;
let coach: TestUser;
let outsider: TestUser;

const upload = (user: TestUser | undefined, body: unknown) =>
  callApi(createUpload, {
    user,
    academyId: academy.id,
    method: "POST",
    path: "/uploads",
    body,
  });

const pdf = {
  fileName: "report.pdf",
  contentType: "application/pdf",
  size: 2048,
};

beforeAll(async () => {
  setStorageForTesting(createMemoryStorage());
  academy = await createTestAcademy();
  [student, coach, outsider] = await Promise.all([
    createTestUser("up-student"),
    createTestUser("up-coach"),
    createTestUser("up-outsider"),
  ]);
  await addMember(academy, student, "student");
  await addMember(academy, coach, "coach");
});

afterAll(async () => {
  setStorageForTesting(undefined);
  await cleanup([academy], [student, coach, outsider]);
});

describe("POST /uploads", () => {
  it("401 without a session, 404 for a non-member", async () => {
    expect((await upload(undefined, pdf)).status).toBe(401);
    expect((await upload(outsider, pdf)).status).toBe(404);
  });

  it("201: a server-made tmp/ key for this academy and uploader, and a 10-minute signed URL", async () => {
    const before = Date.now();
    const response = await upload(student, {
      ...pdf,
      fileName: "../../evil/../name.pdf",
    });
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data).toMatchObject({
      method: "PUT",
      headers: { "content-type": "application/pdf" },
      maxBytes: TEN_MB,
      uploadUrl: expect.stringMatching(MEMORY_UPLOAD_URL),
    });
    expect(data.fileKey).not.toContain("evil");
    expect(parseTmpKey(data.fileKey)).toEqual({
      academyId: academy.id,
      uploaderId: student.id,
      extension: "pdf",
    });
    const lifetime = (Date.parse(data.expiresAt) - before) / 1000;
    expect(lifetime).toBeGreaterThan(UPLOAD_SECONDS - 5);
    expect(lifetime).toBeLessThanOrEqual(UPLOAD_SECONDS + 1);

    const png = await upload(coach, {
      fileName: "x.png",
      contentType: "image/png",
      size: TEN_MB,
    });
    expect((await png.json()).data.fileKey).toMatch(PNG_KEY);
  });

  it("400 for other types, empty or oversized files, unknown keys", async () => {
    for (const body of [
      { ...pdf, contentType: "image/gif" },
      { ...pdf, contentType: "text/html" },
      { ...pdf, size: TEN_MB + 1 },
      { ...pdf, size: 0 },
      { ...pdf, size: 1.5 },
      { ...pdf, fileName: "" },
      { ...pdf, key: "tmp/mine.pdf" },
      { contentType: "application/pdf", size: 10 },
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: a few sequential calls
      const response = await upload(student, body);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("validation_failed");
    }
  });

  it("503 storage_not_configured without storage", async () => {
    setStorageForTesting(null);
    try {
      const response = await upload(student, pdf);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: { code: "storage_not_configured", message: expect.any(String) },
      });
    } finally {
      setStorageForTesting(createMemoryStorage());
    }
  });
});
