/**
 * In-memory ObjectStorage for tests: objects are a Map of key to bytes, and
 * signed URLs are fake `memory://` URLs. `put` stands in for the client's
 * upload to a signed URL.
 */
import type {
  ObjectStorage,
  SignedDownload,
  SignedUpload,
} from "./object-storage";
import { StorageObjectNotFoundError } from "./object-storage";

const MS_PER_SECOND = 1000;

export interface MemoryStorage extends ObjectStorage {
  readonly objects: Map<string, string>;
  /** Simulates the client's PUT to the signed upload URL. */
  put: (key: string, body?: string) => void;
}

export const createMemoryStorage = (): MemoryStorage => {
  const objects = new Map<string, string>();
  const expiry = (seconds: number) =>
    new Date(Date.now() + seconds * MS_PER_SECOND);
  return {
    objects,
    put: (key, body = "file") => {
      objects.set(key, body);
    },
    createUploadUrl: ({
      key,
      contentType,
      expiresInSeconds,
    }): Promise<SignedUpload> =>
      Promise.resolve({
        method: "PUT",
        url: `memory://upload/${encodeURIComponent(key)}?signature=fake`,
        headers: { "content-type": contentType },
        expiresAt: expiry(expiresInSeconds),
      }),
    createDownloadUrl: ({ key, expiresInSeconds }): Promise<SignedDownload> =>
      Promise.resolve({
        url: `memory://download/${encodeURIComponent(key)}?signature=fake`,
        expiresAt: expiry(expiresInSeconds),
      }),
    copyObject: (fromKey, toKey) => {
      const body = objects.get(fromKey);
      if (body === undefined) {
        return Promise.reject(new StorageObjectNotFoundError());
      }
      objects.set(toKey, body);
      return Promise.resolve();
    },
    deleteObject: (key) => {
      objects.delete(key);
      return Promise.resolve();
    },
  };
};
