import { createFileRoute } from "@tanstack/react-router";

import {
  type PersonDialog,
  PersonScreen,
  type PersonSearch,
} from "@/features/owner-users/person-screen";
import { platformUserQueryOptions } from "@/features/owner-users/queries";

const DIALOGS: PersonDialog[] = ["ban", "add", "make-admin", "remove-admin"];

export const Route = createFileRoute("/_auth/owner/users/$userId")({
  validateSearch: (raw: Record<string, unknown>): PersonSearch => ({
    dialog: DIALOGS.find((d) => d === raw.dialog),
    academy:
      typeof raw.academy === "string" && raw.academy ? raw.academy : undefined,
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      platformUserQueryOptions(params.userId)
    ),
  component: PersonPage,
});

function PersonPage() {
  const { userId } = Route.useParams();
  const search = Route.useSearch();
  return <PersonScreen search={search} userId={userId} />;
}
