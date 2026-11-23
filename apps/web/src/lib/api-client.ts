/*
 * Typed client for the app's REST endpoints under /api/v1 (see
 * src/server/api/README.md). Same-origin fetch with the session cookie, JSON in and
 * out, and the server's envelopes:
 *
 *   success  { data }  or, for lists, { data, nextCursor }
 *   error    { error: { code, message, details? } }  -> thrown as ApiError
 *
 * One endpoint answers outside the envelope: GET /academies/:id/academy-qr returns
 * `{ token, deepLink }` at the top level; read it with `apiRaw`.
 *
 * POSTs that create money or attendance rows need an `Idempotency-Key`. Make one key per
 * user action with `newIdempotencyKey()` and pass the same key again when that action is
 * retried, so a retry never creates a second row.
 */

const API_BASE = "/api/v1";

/** Error envelope from the server, or a network failure (status 0, code "network_error"). */
export class ApiError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly status: number;

  constructor(
    input: {
      code: string;
      details?: unknown;
      message: string;
      status: number;
    },
    errorOptions?: ErrorOptions
  ) {
    super(input.message, errorOptions);
    this.name = "ApiError";
    this.code = input.code;
    this.details = input.details;
    this.status = input.status;
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return (
    error instanceof ApiError && (code === undefined || error.code === code)
  );
}

/**
 * Field errors from a 400 `validation_failed`: `details.issues` is
 * `[{ path: "entries.0.status", message }]` (path may also be an array).
 */
export function apiFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || typeof error.details !== "object") {
    return {};
  }
  const details = error.details as Record<string, unknown> | null;
  const result: Record<string, string> = {};
  const issues = details?.issues;
  if (Array.isArray(issues)) {
    for (const issue of issues as {
      path?: string | (string | number)[];
      message?: string;
    }[]) {
      const key = Array.isArray(issue.path) ? issue.path.join(".") : issue.path;
      if (key && issue.message && !(key in result)) {
        result[key] = issue.message;
      }
    }
  }
  return result;
}

const HTTP_UNAUTHORIZED = 401;
const HTTP_SERVER_ERROR = 500;
const OFFLINE_MESSAGE = "Could not reach the server. Check your connection.";
/** What fetch() rejects with when the request never got an answer (Chrome, Firefox, Safari). */
const FETCH_FAILED = /failed to fetch|networkerror|load failed/i;

/**
 * The request never reached the server: our ApiError with status 0, or the raw
 * TypeError fetch() rejects with (Better Auth's client lets that one through).
 */
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 0;
  }
  return error instanceof TypeError && FETCH_FAILED.test(error.message);
}

/**
 * A short, safe message for a toast or an inline warning. Only the server's 4xx
 * messages are shown as they are (they are written for people: "That code has
 * expired"). Server failures, unexpected errors and anything without a real message
 * get `fallback`, so stack traces and internals never reach the screen.
 */
export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Try again."
): string {
  if (isNetworkFailure(error)) {
    return OFFLINE_MESSAGE;
  }
  if (!(error instanceof ApiError)) {
    return fallback;
  }
  if (error.status === HTTP_UNAUTHORIZED) {
    return "Your session has ended. Sign in again.";
  }
  // A form that has no field for the failing path still says what was wrong.
  const [firstIssue] = Object.values(apiFieldErrors(error));
  if (firstIssue) {
    return firstIssue;
  }
  const isWrittenForPeople =
    error.status < HTTP_SERVER_ERROR &&
    error.message.trim() !== "" &&
    error.message !== error.code &&
    !error.message.startsWith("Request failed");
  return isWrittenForPeople ? error.message : fallback;
}

/** `errorMessage` for a Better Auth `onError` context error ({ status, message }). */
export function authErrorMessage(
  error: { status: number; message?: string; code?: string },
  fallback = "Something went wrong. Try again."
): string {
  return errorMessage(
    new ApiError({
      status: error.status,
      code: error.code ?? `http_${error.status}`,
      message: error.message || fallback,
    }),
    fallback
  );
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue | readonly QueryValue[]>;

export interface RequestOptions {
  body?: unknown;
  /** Required by the server on POSTs that create money or attendance rows. */
  idempotencyKey?: string;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Query;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Query): string {
  const url = `${API_BASE}${path}`;
  if (!query) {
    return url;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item !== undefined && item !== null && item !== "") {
        params.append(key, String(item));
      }
    }
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function toApiError(status: number, body: unknown): ApiError {
  const envelope =
    body && typeof body === "object"
      ? (
          body as {
            error?: { code?: unknown; message?: unknown; details?: unknown };
          }
        ).error
      : undefined;
  if (envelope && typeof envelope.code === "string") {
    return new ApiError({
      status,
      code: envelope.code,
      message:
        typeof envelope.message === "string" ? envelope.message : envelope.code,
      details: envelope.details,
    });
  }
  return new ApiError({
    status,
    code: `http_${status}`,
    message: `Request failed (${status})`,
  });
}

/** One request; returns the parsed body as is (no envelope unwrapping). */
export async function apiRaw<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const headers = new Headers({ accept: "application/json" });
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (options.idempotencyKey) {
    headers.set("idempotency-key", options.idempotencyKey);
  }
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      headers,
      credentials: "same-origin",
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(
      {
        status: 0,
        code: "network_error",
        message: OFFLINE_MESSAGE,
      },
      { cause: error }
    );
  }
  const body = await readJson(response);
  if (!response.ok) {
    throw toApiError(response.status, body);
  }
  return body as T;
}

/** `{ data }` endpoints: returns `data`. */
export async function apiData<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const body = await apiRaw<{ data: T } | null>(path, options);
  return (body?.data ?? null) as T;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

/** `{ data, nextCursor }` endpoints: one page. */
export async function apiPage<T>(
  path: string,
  options: RequestOptions = {}
): Promise<Page<T>> {
  const body = await apiRaw<Partial<Page<T>> | null>(path, options);
  return { data: body?.data ?? [], nextCursor: body?.nextCursor ?? null };
}

/** The server's largest page. */
export const MAX_PAGE_SIZE = 200;

/**
 * Follows `nextCursor` until the list ends (or `maxItems` is reached). For screens that
 * show a whole, small list (a roster, a month of fees). Long lists should page instead.
 */
export async function apiAll<T>(
  path: string,
  options: RequestOptions & { maxItems?: number } = {}
): Promise<T[]> {
  const { maxItems = 5000, ...rest } = options;
  const collect = async (cursor: string | null, items: T[]): Promise<T[]> => {
    const page = await apiPage<T>(path, {
      ...rest,
      query: {
        limit: MAX_PAGE_SIZE,
        ...rest.query,
        ...(cursor ? { cursor } : {}),
      },
    });
    const next = [...items, ...page.data];
    return page.nextCursor && next.length < maxItems
      ? collect(page.nextCursor, next)
      : next;
  };
  return await collect(null, []);
}

/** `/academies/:academyId` + rest. */
export function academyPath(academyId: string, rest = ""): string {
  return `/academies/${encodeURIComponent(academyId)}${rest}`;
}

/** `/admin/academies/:academyId` + rest (platform owner's read-only views). */
export function ownerAcademyPath(academyId: string, rest = ""): string {
  return `/admin/academies/${encodeURIComponent(academyId)}${rest}`;
}

/** Unwraps a Better Auth client result (`{ data, error }`), throwing ApiError on error. */
export function unwrapAuth<T>(result: {
  data: T | null;
  error: {
    code?: string;
    message?: string;
    status: number;
    statusText?: string;
  } | null;
}): T {
  if (result.error) {
    throw new ApiError({
      status: result.error.status,
      code: result.error.code ?? `http_${result.error.status}`,
      message:
        // statusText ("Bad Request") is not written for people: leave it to the
        // caller's fallback copy (see errorMessage).
        result.error.message || `Request failed (${result.error.status})`,
    });
  }
  return result.data as T;
}
