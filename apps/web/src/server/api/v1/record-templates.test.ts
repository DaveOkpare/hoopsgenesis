import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RECORD_TEMPLATES } from "../config/record-templates";
import {
  addMember,
  cleanup,
  createTestAcademy,
  createTestUser,
  type TestAcademy,
  type TestUser,
} from "../testing/fixtures";
import { listRecordTemplates } from "./record-templates";
import { callApi } from "./records-fixtures";

interface TemplateItem {
  jsonSchema: { properties: Record<string, unknown>; required?: string[] };
  key: string;
  latest: boolean;
  recordType: string;
  schemaVersion: number;
}

let academy: TestAcademy;
let student: TestUser;
let outsider: TestUser;

const list = (user: TestUser | undefined, query = "") =>
  callApi(listRecordTemplates, {
    user,
    academyId: academy.id,
    path: `/record-templates${query}`,
  });

beforeAll(async () => {
  academy = await createTestAcademy();
  [student, outsider] = await Promise.all([
    createTestUser("tpl-student"),
    createTestUser("tpl-outsider"),
  ]);
  await addMember(academy, student, "student");
});

afterAll(async () => {
  await cleanup([academy], [student, outsider]);
});

describe("GET /record-templates", () => {
  it("401 without a session, 404 for a non-member, 400 for bad filters", async () => {
    expect((await list(undefined)).status).toBe(401);
    expect((await list(outsider)).status).toBe(404);
    expect((await list(student, "?recordType=social")).status).toBe(400);
  });

  it("lists every template with a JSON Schema for the form", async () => {
    const response = await list(student);
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: TemplateItem[] };
    expect(data.map((item) => item.key)).toEqual(
      RECORD_TEMPLATES.map((template) => template.key)
    );
    const sprint = data.find((item) => item.key === "sprint_100m");
    expect(sprint).toMatchObject({
      recordType: "athletic",
      schemaVersion: 1,
      latest: true,
    });
    expect(Object.keys(sprint?.jsonSchema.properties ?? {})).toEqual(
      expect.arrayContaining(["template", "timeSeconds", "timing"])
    );
    expect(sprint?.jsonSchema.required).toEqual(
      expect.arrayContaining(["template", "timeSeconds", "timing"])
    );
  });

  it("filters by recordType", async () => {
    const { data } = (await (
      await list(student, "?recordType=academic&latest=true")
    ).json()) as { data: TemplateItem[] };
    expect(data.map((item) => item.key)).toEqual(["report_card"]);
  });
});
