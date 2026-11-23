import { createFileRoute } from "@tanstack/react-router";

import { AcademyConsole } from "@/features/owner-academies/academy-console";
import {
  platformAcademiesQueryOptions,
  platformAcademyQueryOptions,
} from "@/features/owner-academies/queries";

/*
 * One academy (PA-3). Desktop: the console with this academy's side panel open, so the
 * selection is a shareable link. Phone: the detail panel is the whole page.
 */
export const Route = createFileRoute("/_auth/owner/academies/$academyId")({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(platformAcademiesQueryOptions()),
      context.queryClient.prefetchQuery(
        platformAcademyQueryOptions(params.academyId)
      ),
    ]),
  component: AcademyPage,
});

function AcademyPage() {
  const { academyId } = Route.useParams();
  return <AcademyConsole academyId={academyId} />;
}
