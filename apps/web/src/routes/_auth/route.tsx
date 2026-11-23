import type { QueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { fixtureViewer } from "@/features/viewer/api";
import { viewerKeys, viewerQueryOptions } from "@/features/viewer/queries";
import { getUser } from "@/functions/get-user";
import {
  isUiPreview,
  previewImpersonating,
  previewPersonaFor,
} from "@/lib/preview";

let seededPreviewKey: string | null = null;

/** Preview mode: put the fixture viewer for the URL's persona into the query cache. */
function seedPreviewViewer(
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
  queryClient.setQueryData(
    viewerKeys.all,
    fixtureViewer(persona, { impersonating })
  );
}

/*
 * Everything under /_auth needs a signed-in viewer. Rendered on the client only
 * (ssr: false): the query cache isn't dehydrated from the server, and these screens
 * are behind a session anyway. Child routes read `context.viewer`; components use
 * `useViewer()`.
 */
export const Route = createFileRoute("/_auth")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    if (isUiPreview) {
      seedPreviewViewer(
        context.queryClient,
        location.pathname,
        location.search as Record<string, unknown>
      );
    } else {
      const session = await getUser();
      if (!session) {
        throw redirect({ to: "/login" });
      }
    }
    const viewer = await context.queryClient.ensureQueryData(
      viewerQueryOptions()
    );
    return { viewer };
  },
  component: Outlet,
});
