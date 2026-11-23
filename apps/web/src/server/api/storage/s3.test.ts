/**
 * The S3 storage's requests, with a recording fake fetch (no network).
 * ./s3.minio.test.ts runs the same code against a real MinIO server.
 */
import { describe, expect, it } from "vitest";

import { StorageObjectNotFoundError } from "./object-storage";
import { createS3Storage, S3RequestError, type S3StorageConfig } from "./s3";

const NOW = new Date("2026-11-23T08:30:00.000Z");
const CONFIG: S3StorageConfig = {
  endpoint: "https://s3.eu-west-2.amazonaws.com",
  region: "eu-west-2",
  bucket: "hoops-records",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "secret",
  forcePathStyle: false,
};
const SIGNATURE_HEX = /^[0-9a-f]{64}$/;
const KEY = "tmp/academy1/user1/0b8f7c3e-3c55-4a43-9a43-1a0f0f4b6a11.pdf";

interface Sent {
  headers: Record<string, string>;
  method: string;
  url: string;
}

const fakeFetch = (status: number, body = "") => {
  const sent: Sent[] = [];
  const impl = ((url: string, init: RequestInit) => {
    sent.push({
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
    });
    return Promise.resolve(new Response(body || null, { status }));
  }) as unknown as typeof fetch;
  return { sent, impl };
};

describe("createS3Storage", () => {
  it("presigns uploads virtual-hosted, signing content type and length", async () => {
    const storage = createS3Storage(CONFIG, { now: () => NOW });
    const upload = await storage.createUploadUrl({
      key: KEY,
      contentType: "application/pdf",
      contentLength: 2048,
      expiresInSeconds: 600,
    });
    const url = new URL(upload.url);
    expect(url.origin).toBe("https://hoops-records.s3.eu-west-2.amazonaws.com");
    expect(url.pathname).toBe(`/${KEY}`);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-length;content-type;host"
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-Credential")).toBe(
      "AKIDEXAMPLE/20261123/eu-west-2/s3/aws4_request"
    );
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(SIGNATURE_HEX);
    expect(upload.headers).toEqual({ "content-type": "application/pdf" });
    expect(upload.expiresAt.toISOString()).toBe("2026-11-23T08:40:00.000Z");
  });

  it("presigns downloads path-style under an endpoint base path (Supabase)", async () => {
    const storage = createS3Storage(
      {
        ...CONFIG,
        endpoint: "https://project.supabase.co/storage/v1/s3/",
        forcePathStyle: true,
      },
      { now: () => NOW }
    );
    const download = await storage.createDownloadUrl({
      key: "academies/a/records/s/f.png",
      expiresInSeconds: 300,
    });
    const url = new URL(download.url);
    expect(url.origin).toBe("https://project.supabase.co");
    expect(url.pathname).toBe(
      "/storage/v1/s3/hoops-records/academies/a/records/s/f.png"
    );
    expect(url.searchParams.get("response-content-disposition")).toBe("inline");
    expect(url.searchParams.get("response-cache-control")).toBe(
      "private, no-store"
    );
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(download.expiresAt.toISOString()).toBe("2026-11-23T08:35:00.000Z");
  });

  it("copies with a signed PUT and x-amz-copy-source", async () => {
    const { sent, impl } = fakeFetch(200, "<CopyObjectResult/>");
    const storage = createS3Storage(CONFIG, { now: () => NOW, fetch: impl });
    await storage.copyObject(KEY, "academies/a/records/s/f.pdf");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe("PUT");
    expect(sent[0]?.url).toBe(
      "https://hoops-records.s3.eu-west-2.amazonaws.com/academies/a/records/s/f.pdf"
    );
    expect(sent[0]?.headers).toMatchObject({
      "x-amz-copy-source": `/hoops-records/${KEY}`,
      "x-amz-date": "20261123T083000Z",
      "x-amz-content-sha256":
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      authorization: expect.stringContaining(
        "SignedHeaders=host;x-amz-content-sha256;x-amz-copy-source;x-amz-date"
      ),
    });
  });

  it("maps copy failures: 404 is not found, 200 with an error body is a failure", async () => {
    const missing = createS3Storage(CONFIG, { fetch: fakeFetch(404).impl });
    await expect(missing.copyObject(KEY, "x")).rejects.toBeInstanceOf(
      StorageObjectNotFoundError
    );
    const hidden = createS3Storage(CONFIG, {
      fetch: fakeFetch(200, "<Error><Code>InternalError</Code></Error>").impl,
    });
    await expect(hidden.copyObject(KEY, "x")).rejects.toBeInstanceOf(
      S3RequestError
    );
  });

  it("deletes with a signed DELETE; a missing object is fine; errors never carry the key", async () => {
    const { sent, impl } = fakeFetch(204);
    await createS3Storage(CONFIG, { fetch: impl }).deleteObject(KEY);
    expect(sent[0]?.method).toBe("DELETE");
    await createS3Storage(CONFIG, { fetch: fakeFetch(404).impl }).deleteObject(
      KEY
    );
    const failing = createS3Storage(CONFIG, { fetch: fakeFetch(403).impl });
    const error = await failing.deleteObject(KEY).catch((caught) => caught);
    expect(error).toBeInstanceOf(S3RequestError);
    expect(String(error.message)).not.toContain("academy1");
    expect(error.status).toBe(403);
  });
});
