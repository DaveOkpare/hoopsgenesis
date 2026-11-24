/**
 * The academy's qrNonce is the secret behind its printed QR code. No Better
 * Auth route returns it, to any member (students, coaches, or the academy's
 * own admins); admins get the signed QR from GET /academy-qr instead.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth, db } from "../../services";
import {
  addMember,
  apiRequest,
  cleanup,
  createTestAcademy,
  createTestUser,
  type TestAcademy,
  type TestUser,
} from "./testing/fixtures";
import { getAcademyQr } from "./v1/academy-qr";

const BASE_URL = "http://localhost:3001";
const HTTP_OK = 200;

let academy: TestAcademy;
let admin: TestUser;
let coach: TestUser;
let student: TestUser;
let nonce: string;

const authCall = (
  method: "GET" | "POST",
  path: string,
  user: TestUser,
  body?: unknown
): Promise<Response> =>
  auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method,
      headers: {
        cookie: user.cookie,
        origin: BASE_URL,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

beforeAll(async () => {
  academy = await createTestAcademy();
  [admin, coach, student] = await Promise.all(
    ["qn-admin", "qn-coach", "qn-student"].map((label) => createTestUser(label))
  );
  await Promise.all([
    addMember(academy, admin, "admin"),
    addMember(academy, coach, "coach"),
    addMember(academy, student, "student"),
  ]);
  nonce = (
    await db.organization.findUniqueOrThrow({
      where: { id: academy.id },
      select: { qrNonce: true },
    })
  ).qrNonce;
});

afterAll(async () => {
  await cleanup([academy], [admin, coach, student]);
});

const routes = (): [string, (user: TestUser) => Promise<Response>][] => [
  ["list", (user) => authCall("GET", "/organization/list", user)],
  [
    "get-full-organization",
    (user) =>
      authCall(
        "GET",
        `/organization/get-full-organization?organizationId=${academy.id}`,
        user
      ),
  ],
  [
    "set-active",
    (user) =>
      authCall("POST", "/organization/set-active", user, {
        organizationId: academy.id,
      }),
  ],
];

describe("no Better Auth route returns the academy's qrNonce", () => {
  for (const role of ["student", "coach", "admin"] as const) {
    it(`as ${role}`, async () => {
      const user = { student, coach, admin }[role];
      const replies = await Promise.all(
        routes().map(async ([name, call]) => {
          const response = await call(user);
          return { name, status: response.status, text: await response.text() };
        })
      );
      for (const { name, status, text } of replies) {
        expect(status, name).toBe(HTTP_OK);
        // The academy itself is in the reply (the check is not vacuous).
        expect(text, name).toContain(academy.id);
        expect(text, name).not.toContain("qrNonce");
        expect(text, name).not.toContain(nonce);
      }
    });
  }

  it("the admin still gets the QR from GET /academy-qr", async () => {
    const response = await getAcademyQr({
      request: apiRequest(`/api/v1/academies/${academy.id}/academy-qr`, {
        user: admin,
      }),
      params: { academyId: academy.id },
    });
    expect(response.status).toBe(HTTP_OK);
    const { token } = (await response.json()) as { token: string };
    expect(token.startsWith("hgqr1.")).toBe(true);
  });
});
