import {
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { createFileRoute, Link } from "@tanstack/react-router";

import { CreateAcademyForm } from "@/features/owner-academies/create-academy-form";
import {
  placesQueryOptions,
  platformAcademiesQueryOptions,
} from "@/features/owner-academies/queries";

export const Route = createFileRoute("/_auth/owner/academies/new")({
  /** `?errors=1` validates on load so the error state can be reviewed and linked. */
  validateSearch: (search: Record<string, unknown>): { errors?: 1 } =>
    search.errors === 1 || search.errors === "1" ? { errors: 1 } : {},
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(platformAcademiesQueryOptions()),
      context.queryClient.ensureQueryData(placesQueryOptions()),
    ]),
  component: NewAcademyPage,
});

function NewAcademyPage() {
  const { errors } = Route.useSearch();
  return (
    <>
      <PageHeader>
        <PageHeading>
          <Link
            className="w-fit font-medium text-muted text-sm uppercase leading-[18px] tracking-label hover:text-ink max-md:text-[13px] max-md:leading-4"
            to="/owner"
          >
            ← Academies
          </Link>
          <PageTitle>New academy</PageTitle>
        </PageHeading>
      </PageHeader>
      <CreateAcademyForm showErrors={errors === 1} />
    </>
  );
}
