/**
 * AWS Signature Version 4, with node:crypto only (no SDK).
 *
 * - `presignUrl`: query-string signing, for the URLs clients PUT and GET.
 * - `signHeaders`: Authorization-header signing, for server-side requests
 *   (COPY, DELETE) sent with fetch.
 *
 * S3 rules: the path is URI-encoded once (not twice, unlike other services)
 * and never normalized, so `a//b` and `a/./b` are signed as written.
 * Checked against the AWS SigV4 test suite and the S3 documentation examples
 * in ./sigv4.test.ts.
 *
 * Reference: https://docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html
 */
import { createHash, createHmac } from "node:crypto";

export const SIGV4_ALGORITHM = "AWS4-HMAC-SHA256";
/** For presigned URLs: the client's body is not known when signing. */
export const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
/** SHA-256 of an empty body. */
export const EMPTY_PAYLOAD_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
/** S3's limit for a presigned URL: 7 days. */
export const MAX_PRESIGN_SECONDS = 604_800;

const SCOPE_TERMINATOR = "aws4_request";
const AMZ_DATE_PUNCTUATION = /[-:]|\.\d{3}/g;
const DATE_STAMP_LENGTH = 8;
const RUNS_OF_SPACES = / +/g;
const UNRESERVED = /[A-Za-z0-9\-._~]/;

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface SigV4Scope {
  region: string;
  /** "s3" for storage. */
  service: string;
}

export interface SignableRequest {
  /** Extra headers to sign (and send). `host` is added from `host`. */
  headers?: Readonly<Record<string, string>>;
  /** e.g. `bucket.s3.us-east-1.amazonaws.com` or `localhost:9000`. */
  host: string;
  method: string;
  /** The path as plain text, starting with "/"; it is encoded here. */
  path: string;
  /** SHA-256 hex of the body, or `UNSIGNED-PAYLOAD`. Default: empty body. */
  payloadHash?: string;
  /** Query parameters as plain text; they are encoded here. */
  query?: Readonly<Record<string, string>>;
}

export interface SigningDetails {
  canonicalRequest: string;
  signature: string;
  stringToSign: string;
}

export interface PresignedUrl extends SigningDetails {
  /** Path and query, encoded exactly as signed. Prefix with the origin. */
  pathAndQuery: string;
}

export interface SignedHeaders extends SigningDetails {
  /** Send these (they include `authorization` and `x-amz-date`). */
  headers: Record<string, string>;
}

/** RFC 3986 encoding as SigV4 wants it: only A-Z a-z 0-9 - . _ ~ are kept. */
export const uriEncode = (value: string, encodeSlash = true): string => {
  let encoded = "";
  for (const char of value) {
    if (UNRESERVED.test(char) || (char === "/" && !encodeSlash)) {
      encoded += char;
    } else {
      for (const byte of Buffer.from(char, "utf8")) {
        encoded += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
      }
    }
  }
  return encoded;
};

export const sha256Hex = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const hmac = (key: string | Buffer, value: string): Buffer =>
  createHmac("sha256", key).update(value, "utf8").digest();

/** `20130524T000000Z` */
export const toAmzDate = (date: Date): string =>
  date.toISOString().replace(AMZ_DATE_PUNCTUATION, "");

const credentialScope = (dateStamp: string, scope: SigV4Scope): string =>
  `${dateStamp}/${scope.region}/${scope.service}/${SCOPE_TERMINATOR}`;

const signingKey = (
  secretAccessKey: string,
  dateStamp: string,
  scope: SigV4Scope
): Buffer => {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, scope.region);
  const serviceKey = hmac(regionKey, scope.service);
  return hmac(serviceKey, SCOPE_TERMINATOR);
};

const canonicalQueryString = (
  query: Readonly<Record<string, string>>
): string =>
  Object.entries(query)
    .map(([key, value]) => [uriEncode(key), uriEncode(value)] as const)
    .sort(([keyA, valueA], [keyB, valueB]) => {
      if (keyA !== keyB) {
        return keyA < keyB ? -1 : 1;
      }
      if (valueA === valueB) {
        return 0;
      }
      return valueA < valueB ? -1 : 1;
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

/** Lower-case names, trimmed values with inner runs of spaces collapsed. */
const canonicalHeaders = (
  headers: Readonly<Record<string, string>>
): { canonical: string; signedHeaders: string } => {
  const entries = Object.entries(headers)
    .map(
      ([name, value]) =>
        [name.toLowerCase(), value.trim().replace(RUNS_OF_SPACES, " ")] as const
    )
    .sort(([nameA], [nameB]) => (nameA < nameB ? -1 : 1));
  return {
    canonical: entries.map(([name, value]) => `${name}:${value}\n`).join(""),
    signedHeaders: entries.map(([name]) => name).join(";"),
  };
};

const sign = (
  request: {
    method: string;
    canonicalUri: string;
    canonicalQuery: string;
    headers: Readonly<Record<string, string>>;
    payloadHash: string;
  },
  credentials: SigV4Credentials,
  scope: SigV4Scope,
  amzDate: string
): SigningDetails & { signedHeaders: string } => {
  const { canonical, signedHeaders } = canonicalHeaders(request.headers);
  const canonicalRequest = [
    request.method.toUpperCase(),
    request.canonicalUri,
    request.canonicalQuery,
    canonical,
    signedHeaders,
    request.payloadHash,
  ].join("\n");
  const dateStamp = amzDate.slice(0, DATE_STAMP_LENGTH);
  const stringToSign = [
    SIGV4_ALGORITHM,
    amzDate,
    credentialScope(dateStamp, scope),
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = createHmac(
    "sha256",
    signingKey(credentials.secretAccessKey, dateStamp, scope)
  )
    .update(stringToSign, "utf8")
    .digest("hex");
  return { canonicalRequest, stringToSign, signature, signedHeaders };
};

const withHost = (request: SignableRequest): Record<string, string> => {
  const headers: Record<string, string> = { host: request.host };
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    headers[name.toLowerCase()] = value;
  }
  return headers;
};

/**
 * A presigned URL (query-string auth). Every header in `request.headers` is
 * signed, so the client must send exactly those values (for example the
 * content type and length of an upload).
 */
export const presignUrl = (
  request: SignableRequest,
  credentials: SigV4Credentials,
  scope: SigV4Scope,
  options: { now: Date; expiresInSeconds: number }
): PresignedUrl => {
  const { expiresInSeconds } = options;
  if (
    !Number.isInteger(expiresInSeconds) ||
    expiresInSeconds < 1 ||
    expiresInSeconds > MAX_PRESIGN_SECONDS
  ) {
    throw new RangeError("expiresInSeconds must be 1 to 604800");
  }
  const amzDate = toAmzDate(options.now);
  const dateStamp = amzDate.slice(0, DATE_STAMP_LENGTH);
  const headers = withHost(request);
  const { signedHeaders } = canonicalHeaders(headers);
  const query: Record<string, string> = {
    ...request.query,
    "X-Amz-Algorithm": SIGV4_ALGORITHM,
    "X-Amz-Credential": `${credentials.accessKeyId}/${credentialScope(dateStamp, scope)}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalUri = uriEncode(request.path, false);
  const canonicalQuery = canonicalQueryString(query);
  const details = sign(
    {
      method: request.method,
      canonicalUri,
      canonicalQuery,
      headers,
      payloadHash: request.payloadHash ?? EMPTY_PAYLOAD_SHA256,
    },
    credentials,
    scope,
    amzDate
  );
  return {
    canonicalRequest: details.canonicalRequest,
    stringToSign: details.stringToSign,
    signature: details.signature,
    pathAndQuery: `${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${details.signature}`,
  };
};

/**
 * Authorization-header signing. Adds `x-amz-date` and signs every header
 * given; for S3 pass `x-amz-content-sha256` in `request.headers` too.
 */
export const signHeaders = (
  request: SignableRequest,
  credentials: SigV4Credentials,
  scope: SigV4Scope,
  options: { now: Date }
): SignedHeaders & { pathAndQuery: string } => {
  const amzDate = toAmzDate(options.now);
  const dateStamp = amzDate.slice(0, DATE_STAMP_LENGTH);
  const headers: Record<string, string> = {
    ...withHost(request),
    "x-amz-date": amzDate,
  };
  const canonicalUri = uriEncode(request.path, false);
  const canonicalQuery = canonicalQueryString(request.query ?? {});
  const details = sign(
    {
      method: request.method,
      canonicalUri,
      canonicalQuery,
      headers,
      payloadHash: request.payloadHash ?? EMPTY_PAYLOAD_SHA256,
    },
    credentials,
    scope,
    amzDate
  );
  const authorization = `${SIGV4_ALGORITHM} Credential=${credentials.accessKeyId}/${credentialScope(dateStamp, scope)}, SignedHeaders=${details.signedHeaders}, Signature=${details.signature}`;
  const { host: _host, ...sendHeaders } = headers;
  return {
    canonicalRequest: details.canonicalRequest,
    stringToSign: details.stringToSign,
    signature: details.signature,
    headers: { ...sendHeaders, authorization },
    pathAndQuery:
      canonicalQuery.length > 0
        ? `${canonicalUri}?${canonicalQuery}`
        : canonicalUri,
  };
};
