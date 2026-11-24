import { createFileRoute } from "@tanstack/react-router";

import { AcademyConsole } from "@/features/owner-academies/academy-console";
import { parseConsoleSearch } from "@/features/owner-academies/console-search";
import {
  platformAcademiesQueryOptions,
  platformAcademyQueryOptions,
} from "@/features/owner-academies/queries";
import { useConsoleSearchChange } from "@/features/owner-academies/use-console-search";

/*
 * One academy (PA-3). Desktop: the console with this academy's side panel open, so
 * the selection is a shareable link (the console's search params come along).
 * Tablet and phone: the academy is the whole page (CQ5-0, E51-0).
 */
export const Route = createFileRoute("/_auth/owner/academies/$academyId")({
  validateSearch: parseConsoleSearch,
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
  const search = Route.useSearch();
  const onSearchChange = useConsoleSearchChange("/owner/academies/$academyId");
  return (
    <AcademyConsole
      academyId={academyId}
      onSearchChange={onSearchChange}
      search={search}
    />
  );
}
