/**
 * A tiny HTTP client for the server under test: JSON in, parsed JSON out,
 * one session cookie per user, an Idempotency-Key when asked.
 */
import { randomUUID } from "node:crypto";

import { AUTH_ORIGIN, BASE_URL } from "./env";

/**
 * Response bodies are whatever the server sent; tests check them with
 * assertions, so they are loosely typed on purpose.
 */
// biome-ignore lint/suspicious/noExplicitAny: response bodies are checked by assertions
export type Body = any;

export interface User {
  cookie: string;
  email: string;
  id: string;
  label: string;
  name: string;
}

export interface Reply {
  body: Body;
  headers: Headers;
  status: number;
  text: string;
}

export interface CallOptions {
  /** JSON body (serialized here, with content-type application/json). */
  body?: unknown;
  headers?: Record<string, string>;
  /** `true` makes a fresh random key. */
  idempotencyKey?: string | true;
  /** Sent as is; content-type comes from `headers`. */
  rawBody?: string;
  user?: User | null;
}

export const PASSWORD = "e2e-password-1234";

export const uniqueSuffix = (): string => randomUUID().slice(0, 8);

const buildHeaders = (options: CallOptions): Headers => {
  const headers = new Headers(options.headers);
  if (options.user) {
    headers.set("cookie", options.user.cookie);
  }
  if (options.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (options.idempotencyKey) {
    headers.set(
      "idempotency-key",
      options.idempotencyKey === true ? randomUUID() : options.idempotencyKey
    );
  }
  return headers;
};

const parse = (text: string): Body => {
  if (text.length === 0) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const requestBody = (options: CallOptions): string | undefined => {
  if (options.rawBody !== undefined) {
    return options.rawBody;
  }
  return options.body === undefined ? undefined : JSON.stringify(options.body);
};

/** One request. Never throws on an HTTP status. */
export const call = async (
  method: string,
  path: string,
  options: CallOptions = {}
): Promise<Reply> => {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const response = await fetch(url, {
    method,
    headers: buildHeaders(options),
    body: requestBody(options),
    redirect: "manual",
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    text,
    body: parse(text),
  };
};

/** Better Auth routes need the configured Origin (CSRF check). */
export const authCall = (
  path: string,
  body: unknown,
  user?: User | null
): Promise<Reply> =>
  call("POST", `/api/auth${path}`, {
    user,
    body,
    headers: { origin: AUTH_ORIGIN },
  });

export const authGet = (path: string, user: User): Promise<Reply> =>
  call("GET", `/api/auth${path}`, {
    user,
    headers: { origin: AUTH_ORIGIN },
  });

const cookieHeader = (headers: Headers): string =>
  headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

/** Signs up a new user over HTTP and keeps their session cookie. */
export const signUp = async (
  label: string,
  email = `e2e-${label}-${uniqueSuffix()}@test.hoops-genesis.local`
): Promise<User> => {
  const name = `${label} ${uniqueSuffix()}`;
  const url = `${BASE_URL}/api/auth/sign-up/email`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin: AUTH_ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD, name }),
  });
  const body: Body = await response.json();
  if (response.status !== 200) {
    throw new Error(
      `sign-up ${email} failed: ${response.status} ${JSON.stringify(body)}`
    );
  }
  return {
    id: body.user.id,
    email,
    label,
    name,
    cookie: cookieHeader(response.headers),
  };
};

/** Signs in again (a fresh session), e.g. after a role change. */
export const signIn = async (user: User): Promise<User> => {
  const response = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: AUTH_ORIGIN },
    body: JSON.stringify({ email: user.email, password: PASSWORD }),
  });
  if (response.status !== 200) {
    throw new Error(`sign-in ${user.email} failed: ${response.status}`);
  }
  return { ...user, cookie: cookieHeader(response.headers) };
};

/** `{ error: { code, message, details? } }` and nothing else. */
export const isErrorEnvelope = (body: Body): boolean => {
  if (!body || typeof body !== "object" || Object.keys(body).length !== 1) {
    return false;
  }
  const { error } = body;
  if (!error || typeof error !== "object") {
    return false;
  }
  const keys = Object.keys(error).sort();
  const allowed = ["code", "details", "message"];
  return (
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    keys.every((key) => allowed.includes(key))
  );
};

/** Short description of a reply, for assertion messages. */
export const describeReply = (reply: Reply): string =>
  `${reply.status} ${reply.text.slice(0, 300)}`;
