import type { QueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import type { Viewer } from "@/features/viewer/api";
import { viewerKeys, viewerQueryOptions } from "@/features/viewer/queries";
import { errorKind } from "@/lib/errors";
import {
  isUiPreview,
  previewImpersonating,
  previewPersonaFor,
} from "@/lib/preview";

let seededPreviewKey: string | null = null;

/** Preview mode: put the fixture viewer for the URL's persona into the query cache. */
async function seedPreviewViewer(
  queryClient: QueryClient,
  pathname: string,
  search: Record<string, unknown>
) {
  const persona = previewPersonaFor(pathname, search);
  const impersonating = persona !== "owner" && previewImpersonating(search);
  const key = `${persona}:${impersonating}`;
  if (key === seededPreviewKey) {
    return;
  }
  seededPreviewKey = key;
  const { fixtureViewer } = await import("@/features/viewer/api.mock");
  queryClient.setQueryData(
    viewerKeys.all,
    fixtureViewer(persona, { impersonating })
  );
}

/**
 * The real viewer from the session, or null when nobody is signed in. Any other
 * failure (offline, server down) is thrown to the error screen: signing in again would
 * not help, and "Try again" should.
 */
async function loadViewer(queryClient: QueryClient): Promise<Viewer | null> {
  try {
    return await queryClient.ensureQueryData(viewerQueryOptions());
  } catch (error) {
    queryClient.removeQueries({ queryKey: viewerKeys.all });
    if (errorKind(error) === "unauthorized") {
      return null;
    }
    throw error;
  }
}

/*
 * Everything under /_auth needs a signed-in viewer. Rendered on the client only
 * (ssr: false): the query cache isn't dehydrated from the server, and these screens
 * are behind a session anyway. The viewer comes from the Better Auth session
 * (features/viewer/api.ts). Child routes read `context.viewer`; components use
 * `useViewer()`.
 */
export const Route = createFileRoute("/_auth")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    if (import.meta.env.DEV && isUiPreview) {
      await seedPreviewViewer(
        context.queryClient,
        location.pathname,
        location.search as Record<string, unknown>
      );
    }
    const viewer = await loadViewer(context.queryClient);
    if (!viewer) {
      // Back here after signing in (but not to /app, which only forwards).
      const returnTo = location.pathname === "/app" ? undefined : location.href;
      throw redirect({ to: "/login", search: { redirect: returnTo } });
    }
    return { viewer };
  },
  component: Outlet,
});
