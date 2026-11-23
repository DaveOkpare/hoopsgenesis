import { createFileRoute } from "@tanstack/react-router";

import { AcademyConsole } from "@/features/owner-academies/academy-console";
import { platformAcademiesQueryOptions } from "@/features/owner-academies/queries";

export const Route = createFileRoute("/_auth/owner/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(platformAcademiesQueryOptions()),
  component: AcademiesPage,
});

function AcademiesPage() {
  return <AcademyConsole />;
}
