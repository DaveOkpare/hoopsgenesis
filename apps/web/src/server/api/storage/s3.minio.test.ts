/**
 * Integration test of ./s3.ts against a real S3-compatible server. Runs only
 * when STORAGE_S3_TEST_ENDPOINT is set, e.g. with a local MinIO:
 *
 *   docker run --rm -p 127.0.0.1:9384:9000 \
 *     -e MINIO_ROOT_USER=recordstest -e MINIO_ROOT_PASSWORD=recordstest-secret-123 \
 *     minio/minio server /data
 *   STORAGE_S3_TEST_ENDPOINT=http://127.0.0.1:9384 \
 *   STORAGE_S3_TEST_ACCESS_KEY_ID=recordstest \
 *   STORAGE_S3_TEST_SECRET_ACCESS_KEY=recordstest-secret-123 \
 *     pnpm exec vitest run src/server/api/storage/s3.minio
 *
 * It creates its own bucket and leaves it behind.
 */
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { StorageObjectNotFoundError } from "./object-storage";
import { createS3Storage, type S3StorageConfig } from "./s3";
import { EMPTY_PAYLOAD_SHA256, signHeaders } from "./sigv4";

const endpoint = process.env.STORAGE_S3_TEST_ENDPOINT;
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

const config = (): S3StorageConfig => ({
  endpoint: endpoint ?? "",
  region: "us-east-1",
  bucket: `records-test-${randomUUID().slice(0, 8)}`,
  accessKeyId: process.env.STORAGE_S3_TEST_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.STORAGE_S3_TEST_SECRET_ACCESS_KEY ?? "",
  forcePathStyle: true,
});

const createBucket = async (settings: S3StorageConfig): Promise<void> => {
  const url = new URL(settings.endpoint);
  const signed = signHeaders(
    {
      method: "PUT",
      host: url.host,
      path: `/${settings.bucket}`,
      headers: { "x-amz-content-sha256": EMPTY_PAYLOAD_SHA256 },
    },
    settings,
    { region: settings.region, service: "s3" },
    { now: new Date() }
  );
  const response = await fetch(`${url.origin}${signed.pathAndQuery}`, {
    method: "PUT",
    headers: signed.headers,
  });
  expect(response.status).toBe(HTTP_OK);
};

describe.runIf(endpoint)("S3 storage against a live server", () => {
  it("upload by presigned PUT, copy, presigned GET, delete", async () => {
    const settings = config();
    await createBucket(settings);
    const storage = createS3Storage(settings);
    const tmpKey = `tmp/academy1/user1/${randomUUID()}.pdf`;
    const finalKey = `academies/academy1/records/student1/${randomUUID()}.pdf`;
    const body = "%PDF-1.4 fake report card";

    const upload = await storage.createUploadUrl({
      key: tmpKey,
      contentType: "application/pdf",
      contentLength: body.length,
      expiresInSeconds: 600,
    });
    const put = await fetch(upload.url, {
      method: upload.method,
      headers: upload.headers,
      body,
    });
    expect(put.status).toBe(HTTP_OK);

    // The signed type and length hold: another type or size is refused.
    const wrongType = await fetch(upload.url, {
      method: "PUT",
      headers: { "content-type": "text/html" },
      body,
    });
    expect(wrongType.status).toBe(HTTP_FORBIDDEN);
    const wrongSize = await fetch(upload.url, {
      method: "PUT",
      headers: upload.headers,
      body: `${body} and more`,
    });
    expect(wrongSize.status).toBe(HTTP_FORBIDDEN);

    await storage.copyObject(tmpKey, finalKey);
    await storage.deleteObject(tmpKey);

    const download = await storage.createDownloadUrl({
      key: finalKey,
      expiresInSeconds: 300,
    });
    const get = await fetch(download.url);
    expect(get.status).toBe(HTTP_OK);
    expect(await get.text()).toBe(body);
    expect(get.headers.get("content-type")).toBe("application/pdf");
    expect(get.headers.get("content-disposition")).toBe("inline");
    expect(get.headers.get("cache-control")).toBe("private, no-store");

    // A tampered signature is refused.
    const last = download.url.at(-1) === "0" ? "1" : "0";
    const tampered = await fetch(`${download.url.slice(0, -1)}${last}`);
    expect(tampered.status).toBe(HTTP_FORBIDDEN);

    const oldUpload = await storage.createDownloadUrl({
      key: tmpKey,
      expiresInSeconds: 300,
    });
    expect((await fetch(oldUpload.url)).status).toBe(404);
    await expect(
      storage.copyObject(tmpKey, `${finalKey}.copy`)
    ).rejects.toBeInstanceOf(StorageObjectNotFoundError);

    await storage.deleteObject(finalKey);
    expect((await fetch(download.url)).status).toBe(404);
    // Deleting again is not an error.
    await storage.deleteObject(finalKey);
  });
});
