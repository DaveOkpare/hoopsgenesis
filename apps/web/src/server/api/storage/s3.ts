/**
 * ObjectStorage for any S3-compatible service (AWS S3, Supabase Storage's S3
 * endpoint, Cloudflare R2, MinIO), signed with ./sigv4.ts. No SDK.
 *
 * - Upload and download URLs are presigned (query-string auth); the client
 *   talks to the bucket directly.
 * - Copy and delete are server-side requests with Authorization headers.
 *
 * Errors never include keys, URLs or response bodies: only the operation and
 * the HTTP status, because keys name students.
 */
import {
  type ObjectStorage,
  type SignedDownload,
  type SignedUpload,
  StorageObjectNotFoundError,
} from "./object-storage";
import {
  EMPTY_PAYLOAD_SHA256,
  presignUrl,
  type SigV4Credentials,
  type SigV4Scope,
  signHeaders,
  UNSIGNED_PAYLOAD,
  uriEncode,
} from "./sigv4";

export interface S3StorageConfig {
  accessKeyId: string;
  bucket: string;
  /**
   * Origin plus an optional base path, e.g. `https://s3.us-east-1.amazonaws.com`
   * or `https://<project>.supabase.co/storage/v1/s3`.
   */
  endpoint: string;
  /** `endpoint/bucket/key` instead of `bucket.endpoint/key`. */
  forcePathStyle: boolean;
  region: string;
  secretAccessKey: string;
}

export interface S3StorageOptions {
  fetch?: typeof fetch;
  now?: () => Date;
  /** Per request; default 15 s. */
  timeoutMs?: number;
}

const SERVICE = "s3";
const DEFAULT_TIMEOUT_MS = 15_000;
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_NOT_FOUND = 404;
const MS_PER_SECOND = 1000;
const TRAILING_SLASHES = /\/+$/;
const ERROR_BODY = /<Error>/;

export class S3RequestError extends Error {
  readonly status: number;

  constructor(operation: string, status: number) {
    super(`S3 ${operation} failed with HTTP ${status}`);
    this.name = "S3RequestError";
    this.status = status;
  }
}

interface ObjectLocation {
  host: string;
  origin: string;
  /** Plain-text path (encoded by the signer). */
  path: string;
}

export const createS3Storage = (
  config: S3StorageConfig,
  options: S3StorageOptions = {}
): ObjectStorage => {
  const endpoint = new URL(config.endpoint);
  const basePath = endpoint.pathname.replace(TRAILING_SLASHES, "");
  const credentials: SigV4Credentials = {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  };
  const scope: SigV4Scope = { region: config.region, service: SERVICE };
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const locate = (key: string): ObjectLocation => {
    if (config.forcePathStyle) {
      return {
        host: endpoint.host,
        origin: endpoint.origin,
        path: `${basePath}/${config.bucket}/${key}`,
      };
    }
    const host = `${config.bucket}.${endpoint.host}`;
    return {
      host,
      origin: `${endpoint.protocol}//${host}`,
      path: `${basePath}/${key}`,
    };
  };

  const send = async (
    operation: string,
    method: string,
    key: string,
    extraHeaders: Record<string, string> = {}
  ): Promise<Response> => {
    const location = locate(key);
    const signed = signHeaders(
      {
        method,
        host: location.host,
        path: location.path,
        headers: {
          ...extraHeaders,
          "x-amz-content-sha256": EMPTY_PAYLOAD_SHA256,
        },
      },
      credentials,
      scope,
      { now: now() }
    );
    try {
      return await fetchImpl(`${location.origin}${signed.pathAndQuery}`, {
        method,
        headers: signed.headers,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // The cause would carry the URL (and so the key): report the operation only.
      // biome-ignore lint/style/useErrorCause: the cause names a student's file
      throw new S3RequestError(operation, 0);
    }
  };

  const createUploadUrl: ObjectStorage["createUploadUrl"] = ({
    key,
    contentType,
    contentLength,
    expiresInSeconds,
  }): Promise<SignedUpload> => {
    const issuedAt = now();
    const location = locate(key);
    const headers = { "content-type": contentType };
    const presigned = presignUrl(
      {
        method: "PUT",
        host: location.host,
        path: location.path,
        payloadHash: UNSIGNED_PAYLOAD,
        // content-length is signed too: browsers and React Native set it
        // from the body, so a file of another size is refused by the bucket.
        headers: { ...headers, "content-length": String(contentLength) },
      },
      credentials,
      scope,
      { now: issuedAt, expiresInSeconds }
    );
    return Promise.resolve({
      method: "PUT" as const,
      url: `${location.origin}${presigned.pathAndQuery}`,
      headers,
      expiresAt: new Date(
        issuedAt.getTime() + expiresInSeconds * MS_PER_SECOND
      ),
    });
  };

  const createDownloadUrl: ObjectStorage["createDownloadUrl"] = ({
    key,
    expiresInSeconds,
  }): Promise<SignedDownload> => {
    const issuedAt = now();
    const location = locate(key);
    const presigned = presignUrl(
      {
        method: "GET",
        host: location.host,
        path: location.path,
        payloadHash: UNSIGNED_PAYLOAD,
        query: {
          "response-content-disposition": "inline",
          "response-cache-control": "private, no-store",
        },
      },
      credentials,
      scope,
      { now: issuedAt, expiresInSeconds }
    );
    return Promise.resolve({
      url: `${location.origin}${presigned.pathAndQuery}`,
      expiresAt: new Date(
        issuedAt.getTime() + expiresInSeconds * MS_PER_SECOND
      ),
    });
  };

  const copyObject: ObjectStorage["copyObject"] = async (fromKey, toKey) => {
    const response = await send("copy", "PUT", toKey, {
      "x-amz-copy-source": `/${config.bucket}/${uriEncode(fromKey, false)}`,
    });
    if (response.status === HTTP_NOT_FOUND) {
      throw new StorageObjectNotFoundError();
    }
    // S3 can answer 200 and still report an error in the body.
    const body = await response.text();
    if (response.status !== HTTP_OK || ERROR_BODY.test(body)) {
      throw new S3RequestError("copy", response.status);
    }
  };

  const deleteObject: ObjectStorage["deleteObject"] = async (key) => {
    const response = await send("delete", "DELETE", key);
    await response.body?.cancel();
    const ok =
      response.status === HTTP_NO_CONTENT ||
      response.status === HTTP_OK ||
      response.status === HTTP_NOT_FOUND;
    if (!ok) {
      throw new S3RequestError("delete", response.status);
    }
  };

  return { createUploadUrl, createDownloadUrl, copyObject, deleteObject };
};
