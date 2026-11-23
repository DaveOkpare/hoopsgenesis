import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../../services";
import {
  addMember,
  apiRequest,
  cleanup,
  createTestAcademy,
  createTestUser,
  type TestAcademy,
  type TestUser,
} from "../testing/fixtures";
import {
  createAcademyQrToken,
  getAcademyQr,
  isAcademyQrSignatureValid,
  parseAcademyQrToken,
  regenerateAcademyQr,
  toDeepLink,
} from "./academy-qr";
import { type ErrorBody, readJson } from "./attendance-fixtures";

const TOKEN_PATTERN = /^hgqr1\.[\w-]+\.[\w-]{43}$/;

let academy: TestAcademy;
let otherAcademy: TestAcademy;
let leadAdmin: TestUser;
let admin: TestUser;
let coach: TestUser;
let student: TestUser;
let outsider: TestUser;

/** GET /academy-qr: the API document's `{ token, deepLink }`. */
interface QrCode {
  deepLink: string;
  token: string;
}

const call = (
  handler: typeof getAcademyQr,
  user: TestUser | undefined,
  path: string,
  method = "GET"
) =>
  handler({
    request: apiRequest(`/api/v1/academies/${academy.id}/academy-qr${path}`, {
      user,
      method,
    }),
    params: { academyId: academy.id },
  });

const currentNonce = async (academyId: string): Promise<string> =>
  (
    await db.organization.findUniqueOrThrow({
      where: { id: academyId },
      select: { qrNonce: true },
    })
  ).qrNonce;

const isValid = async (token: string, academyId: string): Promise<boolean> => {
  const parsed = parseAcademyQrToken(token);
  return (
    parsed !== null &&
    parsed.academyId === academyId &&
    isAcademyQrSignatureValid(parsed, await currentNonce(academyId))
  );
};

beforeAll(async () => {
  academy = await createTestAcademy();
  otherAcademy = await createTestAcademy();
  [leadAdmin, admin, coach, student, outsider] = await Promise.all(
    ["lead-admin", "admin", "coach", "student", "outsider"].map((label) =>
      createTestUser(label)
    )
  );
  await addMember(academy, leadAdmin, "admin");
  await addMember(academy, admin, "admin");
  await addMember(academy, coach, "coach");
  await addMember(academy, student, "student");
});

afterAll(async () => {
  await cleanup(
    [academy, otherAcademy],
    [leadAdmin, admin, coach, student, outsider]
  );
});

describe("GET /academy-qr", () => {
  it("gives academy admins the signed token and deep link", async () => {
    const responses = await Promise.all(
      [leadAdmin, admin].map((user) => call(getAcademyQr, user, ""))
    );
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const bodies = await Promise.all(
      responses.map((response) => readJson<QrCode>(response))
    );
    const nonce = await currentNonce(academy.id);
    for (const data of bodies) {
      expect(Object.keys(data).sort()).toEqual(["deepLink", "token"]);
      expect(data.token).toMatch(TOKEN_PATTERN);
      expect(data.deepLink).toBe(`hoops-genesis://check-in?code=${data.token}`);
      expect(parseAcademyQrToken(data.token)?.academyId).toBe(academy.id);
      // The nonce itself is never in the token.
      expect(data.token).not.toContain(nonce);
    }
    expect(await isValid(bodies[0]?.token ?? "", academy.id)).toBe(true);
  });

  it("refuses: 401, 404 non-member, 403 coach and student", async () => {
    expect((await call(getAcademyQr, undefined, "")).status).toBe(401);
    expect((await call(getAcademyQr, outsider, "")).status).toBe(404);
    const forbidden = await call(getAcademyQr, coach, "");
    expect(forbidden.status).toBe(403);
    expect((await readJson<ErrorBody>(forbidden)).error.code).toBe("forbidden");
    expect((await call(getAcademyQr, student, "")).status).toBe(403);
  });
});

describe("POST /academy-qr/regenerate", () => {
  it("issues a new nonce, retires old prints, and audits without the nonce", async () => {
    const old = (
      await readJson<QrCode>(await call(getAcademyQr, leadAdmin, ""))
    ).token;
    const response = await call(
      regenerateAcademyQr,
      admin,
      "/regenerate",
      "POST"
    );
    expect(response.status).toBe(200);
    const fresh = (await readJson<QrCode>(response)).token;
    expect(fresh).not.toBe(old);
    expect(await isValid(fresh, academy.id)).toBe(true);
    expect(await isValid(old, academy.id)).toBe(false);

    const audit = await db.auditLog.findFirstOrThrow({
      where: { academyId: academy.id, action: "academy_qr.regenerate" },
    });
    expect(audit.actorId).toBe(admin.id);
    const nonce = await currentNonce(academy.id);
    expect(JSON.stringify(audit)).not.toContain(nonce);
  });

  it("refuses: 401, 404 non-member, 403 coach", async () => {
    expect(
      (await call(regenerateAcademyQr, undefined, "/regenerate", "POST")).status
    ).toBe(401);
    expect(
      (await call(regenerateAcademyQr, outsider, "/regenerate", "POST")).status
    ).toBe(404);
    expect(
      (await call(regenerateAcademyQr, coach, "/regenerate", "POST")).status
    ).toBe(403);
  });
});

describe("token format", () => {
  it("rejects tampering, other academies and malformed input", async () => {
    const nonce = await currentNonce(academy.id);
    const token = createAcademyQrToken(academy.id, nonce);
    expect(await isValid(token, academy.id)).toBe(true);
    expect(await isValid(toDeepLink(token), academy.id)).toBe(true);

    const [prefix, , signature] = token.split(".");
    const otherId = Buffer.from(otherAcademy.id).toString("base64url");
    // Academy id swapped, signature kept: fails against the other academy.
    expect(
      await isValid(`${prefix}.${otherId}.${signature}`, otherAcademy.id)
    ).toBe(false);
    // Flip the signature's first character: the last one also carries
    // base64url padding bits, so changing it can leave the bytes unchanged.
    const sig = signature ?? "";
    const flipped = `${prefix}.${token.split(".")[1]}.${sig.startsWith("A") ? "B" : "A"}${sig.slice(1)}`;
    expect(await isValid(flipped, academy.id)).toBe(false);
    expect(parseAcademyQrToken("")).toBeNull();
    expect(parseAcademyQrToken("not-a-token")).toBeNull();
    expect(parseAcademyQrToken("hgqr2.a.b")).toBeNull();
    expect(parseAcademyQrToken("hoops-genesis://check-in?x=1")).toBeNull();
    // A short signature must not throw in timingSafeEqual.
    const short = parseAcademyQrToken(`hgqr1.${otherId}.AAAA`);
    expect(short && isAcademyQrSignatureValid(short, nonce)).toBe(false);
  });
});
