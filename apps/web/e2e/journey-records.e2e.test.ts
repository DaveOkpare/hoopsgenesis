/**
 * Record journey (User stories: ST-6, CO-8, CO-9, ST-7, "Uploading and
 * reviewing an academic record"; API endpoints: Student records, Uploads).
 * Storage is not configured locally, so records are created without files.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { type Body, call } from "./helpers/http";
import {
  academicData,
  auditRows,
  buildWorld,
  createRecord,
  expectStatus,
  recordBody,
  todayIn,
  type World,
} from "./helpers/world";

let w: World;

beforeAll(async () => {
  w = await buildWorld();
});

const queueIds = async (user: World["coach"]): Promise<string[]> => {
  const reply = await call(
    "GET",
    w.academy.path("/records?status=pending&limit=200"),
    { user }
  );
  return expectStatus(reply, 200).data.map((row: Body) => row.id);
};

describe("student uploads -> coach reviews -> student sees the result", () => {
  let verified: Body;
  let rejected: Body;

  it("student uploads a report card without a file (ST-6)", async () => {
    verified = await createRecord(
      w.academy,
      w.student,
      w.student.id,
      "academic"
    );
    expect(verified.status).toBe("pending");
    expect(verified.hasFile).toBe(false);
    expect(verified.recordedById).toBe(w.student.id);
    expect(verified.template).toBe("report_card");
    expect(verified).not.toHaveProperty("fileUrl");
    rejected = await createRecord(
      w.academy,
      w.student,
      w.student.id,
      "academic"
    );
  });

  it("the student can still edit a pending record", async () => {
    const reply = await call(
      "PATCH",
      w.academy.path(`/records/${rejected.id}`),
      {
        user: w.student,
        body: { data: { ...academicData(), term: "Second term" } },
      }
    );
    expect(expectStatus(reply, 200).data.data.term).toBe("Second term");
  });

  it("both are in the coach's queue (CO-9), not in team B's coach's", async () => {
    const ids = await queueIds(w.coach);
    expect(ids).toEqual(expect.arrayContaining([verified.id, rejected.id]));
    expect(await queueIds(w.coachB)).not.toContain(verified.id);
  });

  it("coach verifies one and rejects the other with a note", async () => {
    const ok = await call(
      "POST",
      w.academy.path(`/records/${verified.id}/verify`),
      { user: w.coach }
    );
    const okRow = expectStatus(ok, 200).data;
    expect(okRow.status).toBe("verified");
    expect(okRow.verifiedById).toBe(w.coach.id);
    const no = await call(
      "POST",
      w.academy.path(`/records/${rejected.id}/reject`),
      { user: w.coach, body: { reason: "Photo is blurry" } }
    );
    const noRow = expectStatus(no, 200).data;
    expect(noRow.status).toBe("rejected");
    expect(noRow.reviewNote).toBe("Photo is blurry");
  });

  it("reviewed records leave the queue and are final", async () => {
    const ids = await queueIds(w.coach);
    expect(ids).not.toContain(verified.id);
    const again = await call(
      "POST",
      w.academy.path(`/records/${verified.id}/reject`),
      { user: w.coach2, body: { reason: "changed my mind" } }
    );
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("record_not_pending");
    const edit = await call(
      "PATCH",
      w.academy.path(`/records/${verified.id}`),
      {
        user: w.student,
        body: { recordedOn: todayIn(w.academy) },
      }
    );
    expect(edit.status).toBe(409);
    const remove = await call(
      "DELETE",
      w.academy.path(`/records/${rejected.id}`),
      { user: w.student }
    );
    expect(remove.status).toBe(409);
  });

  it("the student sees Verified and the coach's note (ST-6 / ST-7)", async () => {
    const reply = await call(
      "GET",
      w.academy.path(`/students/${w.student.id}/records?recordType=academic`),
      { user: w.student }
    );
    const rows = expectStatus(reply, 200).data;
    const byId = new Map(rows.map((row: Body) => [row.id, row]));
    expect((byId.get(verified.id) as Body)?.status).toBe("verified");
    expect((byId.get(rejected.id) as Body)?.reviewNote).toBe("Photo is blurry");
    const one = await call("GET", w.academy.path(`/records/${verified.id}`), {
      user: w.student,
    });
    const { data } = expectStatus(one, 200);
    expect(data.file).toBeNull();
    expect(data).not.toHaveProperty("fileUrl");
  });

  it("every decision is in the audit log with the coach as actor", async () => {
    const verify = await auditRows(w.academy, w.admin, {
      entityId: verified.id,
    });
    expect(verify.map((row: Body) => row.action)).toEqual(["record.verify"]);
    expect(verify[0].actorId).toBe(w.coach.id);
    const reject = await auditRows(w.academy, w.admin, {
      entityId: rejected.id,
    });
    expect(reject.map((row: Body) => row.action)).toEqual(["record.reject"]);
    expect(reject[0].actorId).toBe(w.coach.id);
    expect(reject[0].reason).toBe("Photo is blurry");
  });
});

describe("who may record and review what", () => {
  it("a student may not record an athletic result -> 403", async () => {
    const reply = await call(
      "POST",
      w.academy.path(`/students/${w.student.id}/records`),
      { user: w.student, body: recordBody(w.academy, "athletic") }
    );
    expect(reply.status).toBe(403);
    expect(reply.body.error.code).toBe("record_type_not_allowed");
  });

  it("a coach records athletic results for their team (CO-8)", async () => {
    const row = await createRecord(
      w.academy,
      w.coach,
      w.student2.id,
      "athletic"
    );
    expect(row.recordedById).toBe(w.coach.id);
    expect(row.status).toBe("pending");
  });

  it("the coach's own entry is not in their queue and they cannot verify it", async () => {
    const row = await createRecord(
      w.academy,
      w.coach,
      w.student2.id,
      "athletic"
    );
    expect(await queueIds(w.coach)).not.toContain(row.id);
    expect(await queueIds(w.coach2)).toContain(row.id);
    const reply = await call(
      "POST",
      w.academy.path(`/records/${row.id}/verify`),
      {
        user: w.coach,
      }
    );
    expect(reply.status).toBe(403);
    expect(reply.body.error.code).toBe("cannot_review_own_record");
    const byOther = await call(
      "POST",
      w.academy.path(`/records/${row.id}/verify`),
      { user: w.coach2 }
    );
    expect(byOther.status).toBe(200);
  });

  it("only the recorder edits a pending record", async () => {
    const row = await createRecord(
      w.academy,
      w.coach,
      w.student2.id,
      "athletic"
    );
    const reply = await call("PATCH", w.academy.path(`/records/${row.id}`), {
      user: w.coach2,
      body: { recordedOn: todayIn(w.academy) },
    });
    expect(reply.status).toBe(403);
  });

  it("data is validated against the template", async () => {
    const reply = await call(
      "POST",
      w.academy.path(`/students/${w.student2.id}/records`),
      {
        user: w.coach,
        body: {
          ...recordBody(w.academy, "athletic"),
          data: { template: "sprint_100m", timeSeconds: 2, timing: "hand" },
        },
      }
    );
    expect(reply.status).toBe(400);
    const unknown = await call(
      "POST",
      w.academy.path(`/students/${w.student2.id}/records`),
      {
        user: w.coach,
        body: {
          ...recordBody(w.academy, "athletic"),
          data: { template: "marathon" },
        },
      }
    );
    expect(unknown.status).toBe(400);
  });

  it("a future recordedOn (academy time) -> 422", async () => {
    const reply = await call(
      "POST",
      w.academy.path(`/students/${w.student.id}/records`),
      {
        user: w.student,
        body: {
          ...recordBody(w.academy, "academic"),
          recordedOn: "2099-01-01",
        },
      }
    );
    expect(reply.status).toBe(422);
  });

  it("uploads: a bad type is 400 before storage; a good one is 503 storage_not_configured", async () => {
    const bad = await call("POST", w.academy.path("/uploads"), {
      user: w.student,
      body: {
        fileName: "a.exe",
        contentType: "application/x-msdownload",
        size: 10,
      },
    });
    expect(bad.status).toBe(400);
    const big = await call("POST", w.academy.path("/uploads"), {
      user: w.student,
      body: {
        fileName: "a.pdf",
        contentType: "application/pdf",
        size: 10 * 1024 * 1024 + 1,
      },
    });
    expect(big.status).toBe(400);
    const ok = await call("POST", w.academy.path("/uploads"), {
      user: w.student,
      body: { fileName: "a.pdf", contentType: "application/pdf", size: 10 },
    });
    expect(ok.status).toBe(503);
    expect(ok.body.error.code).toBe("storage_not_configured");
  });

  it("record templates list the starter templates with JSON schemas", async () => {
    const reply = await call(
      "GET",
      w.academy.path("/record-templates?recordType=athletic"),
      { user: w.student }
    );
    const { data } = expectStatus(reply, 200);
    expect(data.map((row: Body) => row.key).sort()).toEqual([
      "fitness_test",
      "sprint_100m",
    ]);
    expect(data[0].jsonSchema).toBeTypeOf("object");
  });
});
