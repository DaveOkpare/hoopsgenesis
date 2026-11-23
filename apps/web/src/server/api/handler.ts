/**
 * The wrapper every `/api/v1` handler goes through, plus JSON response helpers.
 *
 * ```ts
 * export const listThings = apiHandler(async ({ request, params }) => {
 *   ...
 *   return json({ data });
 * });
 * ```
 */
import { Prisma } from "@hoops-genesis/db/prisma";
import { z } from "zod";

import { ApiError, ValidationError } from "./errors";

/** What a handler receives: the route's request and its path params. */
export interface ApiContext {
  params: Readonly<Record<string, string | undefined>>;
  request: Request;
}

export type ApiHandler = (ctx: ApiContext) => Promise<Response>;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // API responses are per-user; never let a proxy or browser cache them.
  "cache-control": "no-store",
} as const;

const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL_ERROR = 500;

/** A JSON response. `data` must already be serialized (see ./serialize.ts). */
export const json = (data: unknown, init: ResponseInit = {}): Response => {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(JSON_HEADERS)) {
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }
  return new Response(JSON.stringify(data), { ...init, headers });
};

export const created = (data: unknown): Response =>
  json(data, { status: HTTP_CREATED });

export const noContent = (): Response =>
  new Response(null, {
    status: HTTP_NO_CONTENT,
    headers: { "cache-control": "no-store" },
  });

export const errorResponse = (
  status: number,
  code: string,
  message: string,
  details?: unknown
): Response =>
  json(
    {
      error:
        details === undefined ? { code, message } : { code, message, details },
    },
    { status }
  );

/** Zod issues as `[{ path: "entries.0.status", code, message }]`. */
export const formatZodIssues = (
  error: z.ZodError
): { path: string; code: string; message: string }[] =>
  error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    code: issue.code,
    message: issue.message,
  }));

/** Prisma errors that are the client's fault, mapped to API errors. */
const fromPrismaError = (
  error: Prisma.PrismaClientKnownRequestError
): Response | undefined => {
  // Unique constraint: a duplicate slipped past the handler's own checks
  // (e.g. two requests at once). The partial unique indexes make this safe.
  if (error.code === "P2002") {
    return errorResponse(
      HTTP_CONFLICT,
      "conflict",
      "A conflicting record already exists"
    );
  }
  // "Record to update/delete not found".
  if (error.code === "P2025") {
    return errorResponse(HTTP_NOT_FOUND, "not_found", "Not found");
  }
};

/** Path segments that are secrets (invitation ids) and must not be logged. */
const SECRET_PATH_SEGMENT = /(\/(?:admin-)?invitations\/)[^/]+/g;

/** The path as logged: invitation ids become `:id`. */
export const redactPath = (pathname: string): string =>
  pathname.replace(SECRET_PATH_SEGMENT, "$1:id");

const toErrorResponse = (error: unknown, request: Request): Response => {
  if (error instanceof ApiError) {
    return errorResponse(
      error.status,
      error.code,
      error.message,
      error.details
    );
  }
  if (error instanceof z.ZodError) {
    return errorResponse(
      HTTP_BAD_REQUEST,
      "validation_failed",
      "Invalid request",
      {
        issues: formatZodIssues(error),
      }
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = fromPrismaError(error);
    if (mapped) {
      return mapped;
    }
  }
  // Unexpected: log it server-side, never leak details to the client.
  console.error(
    `[api] ${request.method} ${redactPath(new URL(request.url).pathname)}`,
    error
  );
  return errorResponse(
    HTTP_INTERNAL_ERROR,
    "internal_error",
    "Something went wrong"
  );
};

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const JSON_CONTENT_TYPE = "application/json";

/**
 * Does the request declare a body? A form post always carries a content type.
 * A request with neither content-type nor content-length counts as empty:
 * fetch sends a bodiless DELETE exactly like that, and the server's Request
 * exposes a non-null (empty) body stream even when nothing was sent, so
 * `request.body` cannot be used to tell.
 */
const declaresBody = (request: Request): boolean => {
  if (request.headers.has("content-type")) {
    return true;
  }
  const length = request.headers.get("content-length");
  return length !== null && Number(length) > 0;
};

/**
 * A state-changing request must be JSON or truly empty. Browsers send
 * cross-site form posts (urlencoded, multipart, text/plain) with the session
 * cookie and without a CORS preflight; refusing every non-JSON content type
 * here covers the handlers that never read a body too (verify, regenerate).
 * Checked before access: the answer does not depend on who is asking.
 */
export const assertJsonOrEmptyBody = (request: Request): void => {
  if (
    !(
      STATE_CHANGING_METHODS.has(request.method.toUpperCase()) &&
      declaresBody(request)
    )
  ) {
    return;
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith(JSON_CONTENT_TYPE)) {
    throw new ValidationError("Send the body as application/json", {
      code: "unsupported_content_type",
    });
  }
};

export interface ApiHandlerOptions {
  /**
   * Skip the JSON-or-empty check for POST/PUT/PATCH/DELETE. Only for callers
   * that are not browsers holding a session (the payment webhook, which
   * verifies a signature over the raw body).
   */
  anyContentType?: boolean;
}

/**
 * Wraps a handler: refuses non-JSON bodies on state-changing methods (see
 * `assertJsonOrEmptyBody`), runs it, and turns thrown `ApiError`s,
 * `ZodError`s and known Prisma errors into the error envelope. Pass the
 * result straight to `server.handlers.GET` / `POST` / ... in a route file.
 */
export const apiHandler =
  (handler: ApiHandler, options: ApiHandlerOptions = {}): ApiHandler =>
  async (ctx) => {
    try {
      if (!options.anyContentType) {
        assertJsonOrEmptyBody(ctx.request);
      }
      return await handler(ctx);
    } catch (error) {
      return toErrorResponse(error, ctx.request);
    }
  };
