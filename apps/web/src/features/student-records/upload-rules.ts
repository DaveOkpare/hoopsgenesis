/*
 * What POST /uploads accepts ("API endpoints.md", Uploads): PDF, JPEG or PNG, at most
 * 10 MB. The client checks first so the student hears it straight away; the server
 * checks again.
 */
export const ACCEPTED_UPLOAD_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type UploadContentType = (typeof ACCEPTED_UPLOAD_TYPES)[number];

const BYTES_PER_MB = 1_000_000;
const MAX_UPLOAD_MB = 10;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * BYTES_PER_MB;

/** For <input accept>. Extensions too, for systems that report no MIME type. */
export const UPLOAD_ACCEPT_ATTRIBUTE =
  "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

const EXTENSION_TYPES: Record<string, UploadContentType> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

function isAcceptedType(value: string): value is UploadContentType {
  return (ACCEPTED_UPLOAD_TYPES as readonly string[]).includes(value);
}

/** The file's type, falling back to its extension; null when it isn't allowed. */
export function uploadContentType(file: {
  name: string;
  type: string;
}): UploadContentType | null {
  if (isAcceptedType(file.type)) {
    return file.type;
  }
  if (file.type) {
    return null;
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[extension] ?? null;
}

/** A sentence saying what's wrong with the file, or null when it can be uploaded. */
export function uploadProblem(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  if (!uploadContentType(file)) {
    return "That file type can’t be uploaded. Choose a PDF, JPEG or PNG.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `That file is ${formatFileSize(file.size)}. Files can be up to ${MAX_UPLOAD_MB} MB.`;
  }
  if (file.size === 0) {
    return "That file is empty. Choose another one.";
  }
  return null;
}

/** "2.1 MB", "640 KB" */
export function formatFileSize(bytes: number): string {
  if (bytes >= BYTES_PER_MB) {
    return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
  }
  const BYTES_PER_KB = 1000;
  return `${Math.max(1, Math.round(bytes / BYTES_PER_KB))} KB`;
}

/** "Photo" for images, "PDF" for PDFs. */
export function fileKindLabel(contentType: string): string {
  return contentType === "application/pdf" ? "PDF" : "Photo";
}
