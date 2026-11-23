/*
 * What went wrong, in the terms the UI cares about. Screens never show an error's own
 * message or stack: they pick their copy from the kind (components/error-state.tsx).
 *
 *   unauthorized  401: the session ended. Send the person to /login and back again.
 *   forbidden     403: signed in, but not allowed to see this.
 *   not_found     404: the thing does not exist (or not in this academy).
 *   offline       the request never reached the server (ApiError status 0).
 *   failed        anything else: 5xx, a bug in the page, an unexpected answer.
 */
import { ApiError, isNetworkFailure } from "@/lib/api-client";

export type ErrorKind =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "offline"
  | "failed";

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVER_ERROR = 500;

export function errorKind(error: unknown): ErrorKind {
  if (isNetworkFailure(error)) {
    return "offline";
  }
  if (!(error instanceof ApiError)) {
    return "failed";
  }
  switch (error.status) {
    case HTTP_UNAUTHORIZED:
      return "unauthorized";
    case HTTP_FORBIDDEN:
      return "forbidden";
    case HTTP_NOT_FOUND:
      return "not_found";
    default:
      return "failed";
  }
}

/** Worth trying again on its own: the network dropped or the server failed. */
export function isTransientError(error: unknown): boolean {
  return (
    isNetworkFailure(error) ||
    (error instanceof ApiError && error.status >= HTTP_SERVER_ERROR)
  );
}

/** Technical detail for developers only; production consoles stay quiet. */
export function logErrorInDev(error: unknown, where: string): void {
  if (import.meta.env.DEV) {
    console.error(`[${where}]`, error);
  }
}

/** The path to come back to after signing in again (internal paths only). */
export function currentReturnPath(): string | undefined {
  if (typeof window === "undefined") {
    return;
  }
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

const SAFE_RETURN_PATH = /^\/(?![/\\])/;

/** Only same-site paths ("/admin/fees?x=1"), never "//evil.com" or a full URL. */
export function isSafeReturnPath(value: string): boolean {
  return SAFE_RETURN_PATH.test(value) && !value.startsWith("/login");
}
