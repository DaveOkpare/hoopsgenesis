import { createFileRoute } from "@tanstack/react-router";

import { parsePage, parsePerPage } from "@/components/owner/pager";
import {
  UsersScreen,
  type UsersSearch,
} from "@/features/owner-users/users-screen";

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export const Route = createFileRoute("/_auth/owner/users/")({
  validateSearch: (search: Record<string, unknown>): UsersSearch => ({
    q: optionalString(search.q),
    user: optionalString(search.user),
    dialog: search.dialog === "ban" ? "ban" : undefined,
    page: parsePage(search.page),
    per: parsePerPage(search.per),
  }),
  component: UsersPage,
});

function UsersPage() {
  const search = Route.useSearch();
  return <UsersScreen search={search} />;
}
