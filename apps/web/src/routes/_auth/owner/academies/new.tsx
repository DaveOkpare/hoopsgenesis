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
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(platformAcademiesQueryOptions()),
      context.queryClient.ensureQueryData(placesQueryOptions()),
    ]),
  component: NewAcademyPage,
});

function NewAcademyPage() {
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
      <CreateAcademyForm />
    </>
  );
}
