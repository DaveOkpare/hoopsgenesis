/**
 * Server middleware for every `/api/v1/*` request (mounted once, on the
 * `/api/v1` layout route in routes/api/v1/route.ts). TanStack Start renders
 * the app's HTML page for any request no server handler takes, so without
 * this a wrong method or an unknown path answered `200 text/html`. Before
 * anything runs, it matches the path the way Start does:
 *
 * - no route with server handlers at exactly this path -> 404 `not_found`
 * - a route, but no handler for the method           -> 405 `method_not_allowed`
 *   with an `Allow` header
 *
 * both in the usual `{ error: { code, message } }` envelope. Anything else
 * goes on to the route's handler untouched. `/api/auth/*` is not under it.
 */
import { createMiddleware } from "@tanstack/react-start";

import { errorResponse } from "./handler";

const HTTP_NOT_FOUND = 404;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HEAD = "HEAD";
const GET = "GET";
const ANY = "ANY";

interface RouteMatch {
  options: { server?: { handlers?: unknown } };
}

type MatchRoutes = (
  pathname: string
) => readonly [unknown, Record<string, string>, RouteMatch | undefined];

let matchRoutes: MatchRoutes | undefined;

/** The app router's matcher, loaded on first use (the router imports the routes). */
const getMatcher = async (): Promise<MatchRoutes> => {
  if (!matchRoutes) {
    const { getRouter } = await import("../../router");
    const router = getRouter();
    matchRoutes = (pathname) =>
      router.getMatchedRoutes(pathname) as unknown as ReturnType<MatchRoutes>;
  }
  return matchRoutes;
};

const handlerMethods = (route: RouteMatch | undefined): string[] | null => {
  const handlers = route?.options.server?.handlers;
  if (!handlers || typeof handlers !== "object") {
    return null;
  }
  return Object.keys(handlers);
};

/** Which methods a route answers, as an Allow header lists them. */
const allowedMethods = (methods: readonly string[]): string[] => {
  const allowed = new Set(methods.filter((method) => method !== ANY));
  if (allowed.has(GET)) {
    allowed.add(HEAD);
  }
  return [...allowed].sort();
};

const isHandled = (methods: readonly string[], method: string): boolean =>
  methods.includes(method) ||
  methods.includes(ANY) ||
  (method === HEAD && methods.includes(GET));

/**
 * The response for `method` on `pathname` when no handler would take it, or
 * null when one would. Exported for tests.
 */
export const unhandledApiResponse = async (
  method: string,
  pathname: string
): Promise<Response | null> => {
  const match = await getMatcher();
  const [, params, route] = match(pathname);
  const isExactMatch = route !== undefined && params["**"] === undefined;
  const methods = isExactMatch ? handlerMethods(route) : null;
  if (!methods) {
    return errorResponse(HTTP_NOT_FOUND, "not_found", "No such API endpoint");
  }
  const upper = method.toUpperCase();
  if (isHandled(methods, upper)) {
    return null;
  }
  const response = errorResponse(
    HTTP_METHOD_NOT_ALLOWED,
    "method_not_allowed",
    `${upper} is not allowed here`
  );
  response.headers.set("allow", allowedMethods(methods).join(", "));
  return response;
};

export const apiRouteGuard = createMiddleware().server(
  async ({ next, request }) => {
    const unhandled = await unhandledApiResponse(
      request.method,
      new URL(request.url).pathname
    );
    if (unhandled) {
      return unhandled;
    }
    return next();
  }
);
