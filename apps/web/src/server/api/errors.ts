/**
 * Errors that `/api/v1` handlers throw. `apiHandler` (./handler.ts) turns them
 * into the error envelope `{ error: { code, message, details? } }`.
 *
 * Each class has a default `code`; pass `{ code }` for a more specific one
 * that clients can branch on, e.g. `new ConflictError("Already voided",
 * { code: "already_voided" })`.
 */

export interface ApiErrorOptions {
  /** The underlying error, for server logs only; never sent to the client. */
  cause?: unknown;
  /** Machine-readable, snake_case. Defaults to the class's code. */
  code?: string;
  /** Extra data for the client, e.g. validation issues or a distance. */
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(
    status: number,
    defaultCode: string,
    message: string,
    options: ApiErrorOptions = {}
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.status = status;
    this.code = options.code ?? defaultCode;
    this.details = options.details;
  }
}

/** 400: the request is malformed (body, query, params, headers). */
export class ValidationError extends ApiError {
  constructor(message = "Invalid request", options?: ApiErrorOptions) {
    super(400, "validation_failed", message, options);
  }
}

/** 401: no valid session. */
export class UnauthorizedError extends ApiError {
  constructor(message = "Sign in required", options?: ApiErrorOptions) {
    super(401, "unauthorized", message, options);
  }
}

/** 403: signed in and a member, but the role or scope does not allow it. */
export class ForbiddenError extends ApiError {
  constructor(
    message = "You do not have permission to do this",
    options?: ApiErrorOptions
  ) {
    super(403, "forbidden", message, options);
  }
}

/**
 * 404: the resource does not exist, or the caller may not know it exists
 * (non-members of an academy, rows outside the caller's scope).
 */
export class NotFoundError extends ApiError {
  constructor(message = "Not found", options?: ApiErrorOptions) {
    super(404, "not_found", message, options);
  }
}

/** 409: conflicts with the current state (duplicate, already voided, ...). */
export class ConflictError extends ApiError {
  constructor(message = "Conflict", options?: ApiErrorOptions) {
    super(409, "conflict", message, options);
  }
}

/** 410: it existed but can no longer be used (an expired or revoked code). */
export class GoneError extends ApiError {
  constructor(message = "No longer available", options?: ApiErrorOptions) {
    super(410, "gone", message, options);
  }
}

/** 422: well-formed, but a business rule forbids it. */
export class RuleViolationError extends ApiError {
  constructor(message = "This breaks a rule", options?: ApiErrorOptions) {
    super(422, "rule_violation", message, options);
  }
}
