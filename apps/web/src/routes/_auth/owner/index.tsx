import { createFileRoute } from "@tanstack/react-router";

import { AcademyConsole } from "@/features/owner-academies/academy-console";
import { parseConsoleSearch } from "@/features/owner-academies/console-search";
import { platformAcademiesQueryOptions } from "@/features/owner-academies/queries";
import { useConsoleSearchChange } from "@/features/owner-academies/use-console-search";

export const Route = createFileRoute("/_auth/owner/")({
  validateSearch: parseConsoleSearch,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(platformAcademiesQueryOptions()),
  component: AcademiesPage,
});

function AcademiesPage() {
  const search = Route.useSearch();
  const onSearchChange = useConsoleSearchChange("/owner/");
  return <AcademyConsole onSearchChange={onSearchChange} search={search} />;
}
