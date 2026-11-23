/**
 * The storage interface record uploads use. One implementation talks to any
 * S3-compatible service (./s3.ts); tests use ./memory-storage.ts.
 */

export interface SignedUpload {
  expiresAt: Date;
  /** Send exactly these headers with the upload. */
  headers: Record<string, string>;
  method: "PUT";
  url: string;
}

export interface SignedDownload {
  expiresAt: Date;
  url: string;
}

export interface ObjectStorage {
  /** Copies an object; throws `StorageObjectNotFoundError` if `fromKey` is missing. */
  copyObject: (fromKey: string, toKey: string) => Promise<void>;
  /** Signed GET URL that shows the file inline and is never cached. */
  createDownloadUrl: (input: {
    key: string;
    expiresInSeconds: number;
  }) => Promise<SignedDownload>;
  /**
   * Signed PUT URL. The content type and length are signed, so the upload
   * must match what was declared (the size limit holds).
   */
  createUploadUrl: (input: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }) => Promise<SignedUpload>;
  /** Deletes an object; a missing object is not an error. */
  deleteObject: (key: string) => Promise<void>;
}

export class StorageObjectNotFoundError extends Error {
  constructor() {
    super("Storage object not found");
    this.name = "StorageObjectNotFoundError";
  }
}
