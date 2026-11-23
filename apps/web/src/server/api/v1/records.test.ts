import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../../services";
import {
  createMemoryStorage,
  type MemoryStorage,
} from "../storage/memory-storage";
import { setStorageForTesting } from "../storage/storage";
import {
  addMember,
  createTeam,
  createTestAcademy,
  createTestUser,
  type TestAcademy,
  type TestUser,
} from "../testing/fixtures";
import { addDays, todayInTimeZone } from "../time";
import {
  createStudentRecord,
  deleteRecord,
  getRecord,
  listRecordQueue,
  listStudentRecords,
  rejectRecord,
  updateRecord,
  verifyRecord,
} from "./records";
import {
  callApi,
  cleanupWithRecords,
  reportCardData,
  sprintData,
} from "./records-fixtures";
import { createUpload } from "./uploads";

interface RecordItem {
  data: Record<string, unknown>;
  file?: { url: string; expiresAt: string } | null;
  hasFile: boolean;
  id: string;
  recordedById: string;
  recordedOn: string;
  recordType: string;
  reviewNote: string | null;
  schemaVersion: number;
  status: string;
  studentId: string;
  template: string | null;
  verifiedById: string | null;
}

interface PageBody {
  data: RecordItem[];
  nextCursor: string | null;
}

const MEMORY_DOWNLOAD_URL = /^memory:\/\/download\//;
const JPG_KEY = /\.jpg$/;
const TIME_ZONE = "Africa/Lagos";
const today = todayInTimeZone(TIME_ZONE);
const yesterday = addDays(today, -1);
const lastWeek = addDays(today, -7);

let academy: TestAcademy;
let otherAcademy: TestAcademy;
let leadAdmin: TestUser;
let admin: TestUser;
let coachA: TestUser;
let coachB: TestUser;
let coachStudent: TestUser;
let student1: TestUser;
let student2: TestUser;
let student3: TestUser;
let outsider: TestUser;
let storage: MemoryStorage;

const allUsers = () => [
  leadAdmin,
  admin,
  coachA,
  coachB,
  coachStudent,
  student1,
  student2,
  student3,
  outsider,
];

const create = (
  user: TestUser | undefined,
  studentId: string,
  body: unknown,
  academyId = academy.id
) =>
  callApi(createStudentRecord, {
    user,
    academyId,
    method: "POST",
    path: `/students/${studentId}/records`,
    params: { studentId },
    body,
  });

const athletic = (overrides: Record<string, unknown> = {}) => ({
  recordType: "athletic",
  recordedOn: yesterday,
  schemaVersion: 1,
  data: sprintData(),
  ...overrides,
});

const academic = (overrides: Record<string, unknown> = {}) => ({
  recordType: "academic",
  recordedOn: lastWeek,
  schemaVersion: 1,
  data: reportCardData(),
  ...overrides,
});

const createOk = async (
  user: TestUser,
  studentId: string,
  body: unknown
): Promise<RecordItem> => {
  const response = await create(user, studentId, body);
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: RecordItem }).data;
};

const one = (
  handler: typeof getRecord,
  user: TestUser | undefined,
  id: string,
  options: { method?: string; body?: unknown; suffix?: string } = {}
) =>
  callApi(handler, {
    user,
    academyId: academy.id,
    method: options.method ?? "GET",
    path: `/records/${id}${options.suffix ?? ""}`,
    params: { id },
    body: options.body,
  });

const verify = (user: TestUser, id: string) =>
  one(verifyRecord, user, id, { method: "POST", suffix: "/verify" });

const reject = (user: TestUser, id: string, body: unknown) =>
  one(rejectRecord, user, id, { method: "POST", suffix: "/reject", body });

const queue = async (user: TestUser, query = ""): Promise<PageBody> => {
  const response = await callApi(listRecordQueue, {
    user,
    academyId: academy.id,
    path: `/records${query}`,
  });
  expect(response.status).toBe(200);
  return (await response.json()) as PageBody;
};

const uploadKey = async (
  user: TestUser,
  contentType = "application/pdf"
): Promise<string> => {
  const response = await callApi(createUpload, {
    user,
    academyId: academy.id,
    method: "POST",
    path: "/uploads",
    body: { fileName: "card.pdf", contentType, size: 1234 },
  });
  expect(response.status).toBe(201);
  const { data } = (await response.json()) as { data: { fileKey: string } };
  return data.fileKey;
};

const errorCode = async (response: Response): Promise<string> =>
  ((await response.json()) as { error: { code: string } }).error.code;

beforeAll(async () => {
  storage = createMemoryStorage();
  setStorageForTesting(storage);
  [academy, otherAcademy] = await Promise.all([
    createTestAcademy(TIME_ZONE),
    createTestAcademy(TIME_ZONE),
  ]);
  [
    leadAdmin,
    admin,
    coachA,
    coachB,
    coachStudent,
    student1,
    student2,
    student3,
    outsider,
  ] = await Promise.all([
    createTestUser("rec-leadAdmin"),
    createTestUser("rec-admin"),
    createTestUser("rec-coach-a"),
    createTestUser("rec-coach-b"),
    createTestUser("rec-coach-student"),
    createTestUser("rec-student-1"),
    createTestUser("rec-student-2"),
    createTestUser("rec-student-3"),
    createTestUser("rec-outsider"),
  ]);
  await Promise.all([
    addMember(academy, leadAdmin, "admin"),
    addMember(academy, admin, "admin"),
    addMember(academy, coachA, "coach"),
    addMember(academy, coachB, "coach"),
    addMember(academy, coachStudent, "coach,student"),
    addMember(academy, student1, "student"),
    addMember(academy, student2, "student"),
    addMember(academy, student3, "student"),
    addMember(otherAcademy, outsider, "admin"),
    addMember(otherAcademy, student3, "student"),
  ]);
  await createTeam(academy, [coachA, coachStudent, student1, student2]);
  await createTeam(academy, [coachB, student3]);
});

afterAll(async () => {
  setStorageForTesting(undefined);
  await cleanupWithRecords([academy, otherAcademy], allUsers());
});

describe("POST /students/:studentId/records", () => {
  it("401 without a session, 404 for a non-member, 400 for unknown keys", async () => {
    expect((await create(undefined, student1.id, academic())).status).toBe(401);
    const notMember = await create(outsider, student1.id, academic());
    expect(notMember.status).toBe(404);
    const extra = await create(
      leadAdmin,
      student1.id,
      academic({ colour: "red" })
    );
    expect(extra.status).toBe(400);
    expect(await errorCode(extra)).toBe("validation_failed");
  });

  it("a student records their own academic record; recorded_by is the session", async () => {
    const spoofed = await create(
      student1,
      student1.id,
      academic({ recordedById: coachA.id })
    );
    expect(spoofed.status).toBe(400);
    const record = await createOk(student1, student1.id, academic());
    expect(record).toMatchObject({
      studentId: student1.id,
      recordedById: student1.id,
      recordType: "academic",
      template: "report_card",
      status: "pending",
      verifiedById: null,
      hasFile: false,
      recordedOn: lastWeek,
    });
  });

  it("a student may not record athletic results, or for someone else", async () => {
    const athleticOwn = await create(student1, student1.id, athletic());
    expect(athleticOwn.status).toBe(403);
    expect(await errorCode(athleticOwn)).toBe("record_type_not_allowed");
    const forOther = await create(student1, student2.id, academic());
    expect(forOther.status).toBe(404);
  });

  it("coach of the team: athletic and academic; coach of another team: 404", async () => {
    await createOk(coachA, student1.id, athletic());
    await createOk(coachA, student1.id, academic());
    const otherTeam = await create(coachB, student1.id, athletic());
    expect(otherTeam.status).toBe(404);
  });

  it("a coach who is also a student may not record athletic results for themself", async () => {
    const self = await create(coachStudent, coachStudent.id, athletic());
    expect(self.status).toBe(403);
    await createOk(coachStudent, coachStudent.id, academic());
  });

  it("academy admins record for any student; non-students and other academies are 404", async () => {
    await createOk(leadAdmin, student3.id, athletic());
    await createOk(admin, student3.id, academic());
    expect((await create(leadAdmin, coachA.id, athletic())).status).toBe(404);
    expect((await create(leadAdmin, "no-such-user", athletic())).status).toBe(
      404
    );
    // student3 is also a student of otherAcademy; its leadAdmin cannot write here.
    expect(
      (await create(outsider, student3.id, athletic(), academy.id)).status
    ).toBe(404);
  });

  it("validates data against the template and schema version", async () => {
    const invalid = await create(
      coachA,
      student1.id,
      athletic({ data: { ...sprintData(), timeSeconds: "fast" } })
    );
    expect(invalid.status).toBe(400);
    const body = await invalid.json();
    expect(body.error.code).toBe("invalid_record_data");
    expect(body.error.details.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "data.timeSeconds" }),
      ])
    );

    const extraField = await create(
      coachA,
      student1.id,
      athletic({ data: { ...sprintData(), mood: "great" } })
    );
    expect(await errorCode(extraField)).toBe("invalid_record_data");

    const unknown = await create(
      coachA,
      student1.id,
      athletic({ data: { template: "high_jump" } })
    );
    expect(unknown.status).toBe(400);
    expect(await errorCode(unknown)).toBe("unknown_template");

    const missing = await create(
      coachA,
      student1.id,
      athletic({ data: { timeSeconds: 12 } })
    );
    expect(await errorCode(missing)).toBe("unknown_template");

    const wrongType = await create(
      coachA,
      student1.id,
      athletic({ data: reportCardData() })
    );
    expect(await errorCode(wrongType)).toBe("unknown_template");

    const version = await create(
      coachA,
      student1.id,
      athletic({ schemaVersion: 2 })
    );
    expect(version.status).toBe(400);
    expect(await errorCode(version)).toBe("unknown_schema_version");

    const emptyFitness = await create(
      coachA,
      student1.id,
      athletic({ data: { template: "fitness_test" } })
    );
    expect(await errorCode(emptyFitness)).toBe("invalid_record_data");
    await createOk(
      coachA,
      student1.id,
      athletic({ data: { template: "fitness_test", pushUps: 30 } })
    );
  });

  it("422 for a recordedOn in the future", async () => {
    const response = await create(
      coachA,
      student1.id,
      athletic({ recordedOn: addDays(today, 2) })
    );
    expect(response.status).toBe(422);
    expect(await errorCode(response)).toBe("recorded_on_in_future");
  });
});

describe("files on records", () => {
  it("attaches an upload: moves it out of tmp/, stores only the permanent key, signs a download URL", async () => {
    const fileKey = await uploadKey(student1);
    storage.put(fileKey, "pdf-bytes");
    const record = await createOk(student1, student1.id, academic({ fileKey }));
    expect(record.hasFile).toBe(true);
    expect(storage.objects.has(fileKey)).toBe(false);

    const row = await db.studentRecord.findUniqueOrThrow({
      where: { id: record.id },
    });
    expect(row.fileUrl).toMatch(
      new RegExp(`^academies/${academy.id}/records/${student1.id}/`)
    );
    expect(storage.objects.get(row.fileUrl ?? "")).toBe("pdf-bytes");

    const response = await one(getRecord, student1, record.id);
    expect(response.status).toBe(200);
    const text = await response.text();
    // The raw storage key is never sent; only the signed URL.
    expect(text).not.toContain(`"academies/${academy.id}`);
    expect(text).not.toContain("fileUrl");
    const { data } = JSON.parse(text) as { data: RecordItem };
    expect(data.file?.url).toMatch(MEMORY_DOWNLOAD_URL);
    const expiresIn = Date.parse(data.file?.expiresAt ?? "") - Date.now();
    expect(expiresIn).toBeGreaterThan(0);
    expect(expiresIn).toBeLessThanOrEqual(300_000);
  });

  it("refuses a fileKey from another uploader or another academy, malformed or not uploaded", async () => {
    const coachKey = await uploadKey(coachA);
    storage.put(coachKey);
    const notMine = await create(
      student1,
      student1.id,
      academic({ fileKey: coachKey })
    );
    expect(notMine.status).toBe(403);
    expect(await errorCode(notMine)).toBe("file_not_owned");

    const otherAcademyKey = `tmp/${otherAcademy.id}/${student1.id}/00000000-0000-4000-8000-000000000000.pdf`;
    storage.put(otherAcademyKey);
    const crossAcademy = await create(
      student1,
      student1.id,
      academic({ fileKey: otherAcademyKey })
    );
    expect(crossAcademy.status).toBe(403);
    expect(await errorCode(crossAcademy)).toBe("file_not_owned");

    const permanent = `academies/${academy.id}/records/${student1.id}/x.pdf`;
    const malformed = await create(
      student1,
      student1.id,
      academic({ fileKey: permanent })
    );
    expect(malformed.status).toBe(400);
    expect(await errorCode(malformed)).toBe("invalid_file_key");

    const neverUploaded = await uploadKey(student1);
    const missing = await create(
      student1,
      student1.id,
      academic({ fileKey: neverUploaded })
    );
    expect(missing.status).toBe(422);
    expect(await errorCode(missing)).toBe("file_not_uploaded");
  });

  it("PATCH replaces the file (old copy deleted) and fileKey null removes it", async () => {
    const first = await uploadKey(student2, "image/png");
    storage.put(first, "v1");
    const record = await createOk(
      student2,
      student2.id,
      academic({ fileKey: first })
    );
    const firstKey = (
      await db.studentRecord.findUniqueOrThrow({ where: { id: record.id } })
    ).fileUrl;

    const second = await uploadKey(student2, "image/jpeg");
    storage.put(second, "v2");
    const replaced = await one(updateRecord, student2, record.id, {
      method: "PATCH",
      body: { fileKey: second },
    });
    expect(replaced.status).toBe(200);
    const secondKey = (
      await db.studentRecord.findUniqueOrThrow({ where: { id: record.id } })
    ).fileUrl;
    expect(secondKey).toMatch(JPG_KEY);
    expect(storage.objects.has(firstKey ?? "")).toBe(false);
    expect(storage.objects.get(secondKey ?? "")).toBe("v2");

    const removed = await one(updateRecord, student2, record.id, {
      method: "PATCH",
      body: { fileKey: null },
    });
    expect(((await removed.json()) as { data: RecordItem }).data.hasFile).toBe(
      false
    );
    expect(storage.objects.has(secondKey ?? "")).toBe(false);
  });

  it("without storage: 503 for uploads, file keys and file URLs; file-less records still work", async () => {
    const fileKey = await uploadKey(student1);
    storage.put(fileKey);
    const withFile = await createOk(
      student1,
      student1.id,
      academic({ fileKey })
    );
    setStorageForTesting(null);
    try {
      const upload = await callApi(createUpload, {
        user: student1,
        academyId: academy.id,
        method: "POST",
        path: "/uploads",
        body: { fileName: "a.pdf", contentType: "application/pdf", size: 10 },
      });
      expect(upload.status).toBe(503);
      expect(await errorCode(upload)).toBe("storage_not_configured");

      const attach = await create(student1, student1.id, academic({ fileKey }));
      expect(attach.status).toBe(503);

      const fileUrl = await one(getRecord, student1, withFile.id);
      expect(fileUrl.status).toBe(503);
      expect(await errorCode(fileUrl)).toBe("storage_not_configured");

      const plain = await createOk(student1, student1.id, academic());
      const read = await one(getRecord, student1, plain.id);
      expect(read.status).toBe(200);
      expect(
        ((await read.json()) as { data: RecordItem }).data.file
      ).toBeNull();
      expect((await verify(coachA, plain.id)).status).toBe(200);
    } finally {
      setStorageForTesting(storage);
    }
  });
});

describe("GET /students/:studentId/records", () => {
  let filterStudent: TestUser;

  beforeAll(async () => {
    filterStudent = student2;
    await createOk(
      coachA,
      filterStudent.id,
      athletic({ recordedOn: lastWeek })
    );
    await createOk(
      coachA,
      filterStudent.id,
      athletic({ recordedOn: yesterday, data: sprintData(11.9) })
    );
    await createOk(
      coachA,
      filterStudent.id,
      athletic({
        recordedOn: today,
        data: { template: "fitness_test", sitUps: 40 },
      })
    );
  });

  const list = (user: TestUser | undefined, studentId: string, query = "") =>
    callApi(listStudentRecords, {
      user,
      academyId: academy.id,
      path: `/students/${studentId}/records${query}`,
      params: { studentId },
    });

  it("404 for anyone who is not a student of this academy, even to an admin", async () => {
    // A coach, another academy's admin, a made-up id.
    for (const studentId of [coachA.id, outsider.id, "no-such-user"]) {
      // biome-ignore lint/performance/noAwaitInLoops: a few sequential calls
      const response = await list(leadAdmin, studentId);
      expect({ studentId, status: response.status }).toEqual({
        studentId,
        status: 404,
      });
    }
    // A coach who is also a student is a student.
    expect((await list(leadAdmin, coachStudent.id)).status).toBe(200);
  });

  it("scoping: own, own team's coach, academy admin; others 404; 401 and 404 for outsiders", async () => {
    expect((await list(undefined, student2.id)).status).toBe(401);
    expect((await list(outsider, student2.id)).status).toBe(404);
    expect((await list(student1, student2.id)).status).toBe(404);
    expect((await list(coachB, student2.id)).status).toBe(404);
    for (const user of [student2, coachA, leadAdmin, admin]) {
      // biome-ignore lint/performance/noAwaitInLoops: a few sequential calls
      const response = await list(user, student2.id);
      expect(response.status).toBe(200);
    }
  });

  it("filters by recordType, template, status and date range; newest first", async () => {
    const body = (await (
      await list(student2, student2.id, "?recordType=athletic")
    ).json()) as PageBody;
    expect(body.data).toHaveLength(3);
    expect(body.data.map((row) => row.recordedOn)).toEqual([
      today,
      yesterday,
      lastWeek,
    ]);
    expect(body.data.every((row) => row.studentId === student2.id)).toBe(true);

    const sprints = (await (
      await list(student2, student2.id, "?template=sprint_100m")
    ).json()) as PageBody;
    expect(sprints.data).toHaveLength(2);

    const ranged = (await (
      await list(
        student2,
        student2.id,
        `?recordType=athletic&from=${yesterday}&to=${yesterday}`
      )
    ).json()) as PageBody;
    expect(ranged.data.map((row) => row.data.timeSeconds)).toEqual([11.9]);

    const verified = (await (
      await list(student2, student2.id, "?status=verified&recordType=athletic")
    ).json()) as PageBody;
    expect(verified.data).toHaveLength(0);

    const badRange = await list(
      student2,
      student2.id,
      `?from=${today}&to=${lastWeek}`
    );
    expect(await errorCode(badRange)).toBe("invalid_range");
    expect((await list(student2, student2.id, "?status=lost")).status).toBe(
      400
    );
  });

  it("paginates with a cursor", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor
        ? `?recordType=athletic&limit=2&cursor=${cursor}`
        : "?recordType=athletic&limit=2";
      // biome-ignore lint/performance/noAwaitInLoops: each page needs the last cursor
      const body = (await (
        await list(leadAdmin, student2.id, query)
      ).json()) as PageBody;
      seen.push(...body.data.map((row) => row.id));
      cursor = body.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(3);
  });
});

describe("review queue, verify and reject", () => {
  let studentUpload: RecordItem;
  let coachRecorded: RecordItem;
  let otherTeamRecord: RecordItem;
  let aboutCoachStudent: RecordItem;

  beforeAll(async () => {
    studentUpload = await createOk(student1, student1.id, academic());
    coachRecorded = await createOk(coachA, student1.id, athletic());
    otherTeamRecord = await createOk(coachB, student3.id, athletic());
    aboutCoachStudent = await createOk(coachA, coachStudent.id, academic());
  });

  it("403 for students; 401 and 404 as usual", async () => {
    const response = await callApi(listRecordQueue, {
      user: student1,
      academyId: academy.id,
      path: "/records",
    });
    expect(response.status).toBe(403);
    const anonymous = await callApi(listRecordQueue, {
      academyId: academy.id,
      path: "/records",
    });
    expect(anonymous.status).toBe(401);
    const outside = await callApi(listRecordQueue, {
      user: outsider,
      academyId: academy.id,
      path: "/records",
    });
    expect(outside.status).toBe(404);
  });

  it("a coach's queue: own teams only, never their own uploads", async () => {
    const ids = (await queue(coachA, "?limit=200")).data.map((row) => row.id);
    expect(ids).toContain(studentUpload.id);
    expect(ids).not.toContain(coachRecorded.id);
    expect(ids).not.toContain(aboutCoachStudent.id);
    expect(ids).not.toContain(otherTeamRecord.id);

    const coachBIds = (await queue(coachB, "?limit=200")).data.map(
      (row) => row.id
    );
    expect(coachBIds).not.toContain(otherTeamRecord.id);
    expect(coachBIds).not.toContain(studentUpload.id);
  });

  it("a coach who is also a student never sees records about themself", async () => {
    const ids = (await queue(coachStudent, "?limit=200")).data.map(
      (row) => row.id
    );
    expect(ids).toContain(coachRecorded.id);
    expect(ids).not.toContain(aboutCoachStudent.id);
    const self = await verify(coachStudent, aboutCoachStudent.id);
    expect(self.status).toBe(403);
    expect(await errorCode(self)).toBe("cannot_review_own_record");
  });

  it("leadAdmin sees every team's pending records, oldest first, and only pending by default", async () => {
    const body = await queue(leadAdmin, "?limit=200");
    const ids = body.data.map((row) => row.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        studentUpload.id,
        coachRecorded.id,
        otherTeamRecord.id,
        aboutCoachStudent.id,
      ])
    );
    expect(body.data.every((row) => row.status === "pending")).toBe(true);
    expect(ids.indexOf(studentUpload.id)).toBeLessThan(
      ids.indexOf(aboutCoachStudent.id)
    );
    const athleticOnly = await queue(
      leadAdmin,
      "?recordType=athletic&limit=200"
    );
    expect(
      athleticOnly.data.every((row) => row.recordType === "athletic")
    ).toBe(true);
  });

  it("verify: the recorder gets 403, another team's coach 404, the team's coach 200 and an audit row", async () => {
    const own = await verify(coachA, coachRecorded.id);
    expect(own.status).toBe(403);
    expect(await errorCode(own)).toBe("cannot_review_own_record");
    expect((await verify(coachB, studentUpload.id)).status).toBe(404);
    expect((await verify(student2, studentUpload.id)).status).toBe(403);

    const response = await verify(coachA, studentUpload.id);
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: RecordItem };
    expect(data).toMatchObject({ status: "verified", verifiedById: coachA.id });

    const audit = await db.auditLog.findMany({
      where: { entityType: "student_record", entityId: studentUpload.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      academyId: academy.id,
      actorId: coachA.id,
      action: "record.verify",
    });
    expect(audit[0]?.before).toMatchObject({ status: "pending" });
    expect(audit[0]?.after).toMatchObject({ status: "verified" });
    expect(JSON.stringify(audit[0])).not.toContain("fileUrl");

    const again = await verify(leadAdmin, studentUpload.id);
    expect(again.status).toBe(409);
    expect(await errorCode(again)).toBe("record_not_pending");
    expect(
      (await queue(coachA, "?limit=200")).data.map((r) => r.id)
    ).not.toContain(studentUpload.id);
    const reviewed = await queue(coachA, "?status=verified&limit=200");
    expect(reviewed.data.map((row) => row.id)).toContain(studentUpload.id);
  });

  it("verified records are final: PATCH and DELETE are 409", async () => {
    const patch = await one(updateRecord, student1, studentUpload.id, {
      method: "PATCH",
      body: { recordedOn: yesterday },
    });
    expect(patch.status).toBe(409);
    expect(await errorCode(patch)).toBe("record_not_pending");
    const remove = await one(deleteRecord, leadAdmin, studentUpload.id, {
      method: "DELETE",
    });
    expect(remove.status).toBe(409);
  });

  it("reject needs a reason, stores it as the review note the student reads, and is audited", async () => {
    const noReason = await reject(leadAdmin, aboutCoachStudent.id, {});
    expect(noReason.status).toBe(400);
    const blank = await reject(leadAdmin, aboutCoachStudent.id, {
      reason: "  ",
    });
    expect(blank.status).toBe(400);

    const response = await reject(leadAdmin, aboutCoachStudent.id, {
      reason: "The photo is blurry; please upload again.",
    });
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: RecordItem };
    expect(data).toMatchObject({
      status: "rejected",
      verifiedById: leadAdmin.id,
      reviewNote: "The photo is blurry; please upload again.",
    });

    const asStudent = await one(getRecord, coachStudent, aboutCoachStudent.id);
    expect(asStudent.status).toBe(200);
    expect(
      ((await asStudent.json()) as { data: RecordItem }).data.reviewNote
    ).toBe("The photo is blurry; please upload again.");

    const audit = await db.auditLog.findFirst({
      where: { entityId: aboutCoachStudent.id, action: "record.reject" },
    });
    expect(audit).toMatchObject({
      actorId: leadAdmin.id,
      reason: "The photo is blurry; please upload again.",
    });
    expect(
      (await reject(admin, aboutCoachStudent.id, { reason: "again" })).status
    ).toBe(409);
  });

  it("coach of another team cannot reject; admin can verify another team's record", async () => {
    expect(
      (await reject(coachA, otherTeamRecord.id, { reason: "no" })).status
    ).toBe(404);
    expect((await verify(admin, otherTeamRecord.id)).status).toBe(200);
  });
});

describe("GET, PATCH and DELETE /records/:id", () => {
  let record: RecordItem;

  beforeAll(async () => {
    record = await createOk(student1, student1.id, academic());
  });

  it("GET is scoped: other team's coach, other students and other academies get 404", async () => {
    expect((await one(getRecord, undefined, record.id)).status).toBe(401);
    expect((await one(getRecord, coachB, record.id)).status).toBe(404);
    expect((await one(getRecord, student2, record.id)).status).toBe(404);
    expect((await one(getRecord, coachA, record.id)).status).toBe(200);
    const crossAcademy = await callApi(getRecord, {
      user: outsider,
      academyId: otherAcademy.id,
      path: `/records/${record.id}`,
      params: { id: record.id },
    });
    expect(crossAcademy.status).toBe(404);
  });

  it("PATCH: only the recorder, revalidates data, rejects empty bodies", async () => {
    const notRecorder = await one(updateRecord, coachA, record.id, {
      method: "PATCH",
      body: { recordedOn: yesterday },
    });
    expect(notRecorder.status).toBe(403);
    expect(await errorCode(notRecorder)).toBe("not_recorder");
    const empty = await one(updateRecord, student1, record.id, {
      method: "PATCH",
      body: {},
    });
    expect(empty.status).toBe(400);
    const invalid = await one(updateRecord, student1, record.id, {
      method: "PATCH",
      body: { data: { ...reportCardData(), subjects: [] } },
    });
    expect(await errorCode(invalid)).toBe("invalid_record_data");
    const badVersion = await one(updateRecord, student1, record.id, {
      method: "PATCH",
      body: { schemaVersion: 9 },
    });
    expect(await errorCode(badVersion)).toBe("unknown_schema_version");
    const noType = await one(updateRecord, student1, record.id, {
      method: "PATCH",
      body: { recordType: "athletic" },
    });
    expect(noType.status).toBe(400);

    const response = await one(updateRecord, student1, record.id, {
      method: "PATCH",
      body: {
        recordedOn: yesterday,
        data: { ...reportCardData(), term: "Second term" },
      },
    });
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: RecordItem };
    expect(data).toMatchObject({ recordedOn: yesterday, status: "pending" });
    expect(data.data.term).toBe("Second term");
  });

  it("PATCH: an academy admin may delete a pending record but not edit it, even their own", async () => {
    const byAdmin = await createOk(admin, student1.id, athletic());
    const response = await one(updateRecord, admin, byAdmin.id, {
      method: "PATCH",
      body: { recordedOn: yesterday },
    });
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("admin_delete_only");
    expect(
      (await one(deleteRecord, admin, byAdmin.id, { method: "DELETE" })).status
    ).toBe(204);
  });

  it("DELETE: recorder or academy admin, only while pending", async () => {
    expect(
      (await one(deleteRecord, coachA, record.id, { method: "DELETE" })).status
    ).toBe(403);
    expect(
      (await one(deleteRecord, student1, record.id, { method: "DELETE" }))
        .status
    ).toBe(204);
    expect((await one(getRecord, student1, record.id)).status).toBe(404);

    const coachRecord = await createOk(coachA, student1.id, athletic());
    expect(
      (await one(deleteRecord, admin, coachRecord.id, { method: "DELETE" }))
        .status
    ).toBe(204);
  });

  it("DELETE removes the stored file", async () => {
    const fileKey = await uploadKey(student1, "image/jpeg");
    storage.put(fileKey);
    const withFile = await createOk(
      student1,
      student1.id,
      academic({ fileKey })
    );
    const { fileUrl } = await db.studentRecord.findUniqueOrThrow({
      where: { id: withFile.id },
    });
    expect(storage.objects.has(fileUrl ?? "")).toBe(true);
    const response = await one(deleteRecord, student1, withFile.id, {
      method: "DELETE",
    });
    expect(response.status).toBe(204);
    expect(storage.objects.has(fileUrl ?? "")).toBe(false);
  });
});
