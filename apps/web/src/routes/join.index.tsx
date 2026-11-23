import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  type JoinNavigation,
  JoinPage,
} from "@/features/join-codes/join/join-page";
import { parseJoinSearch } from "@/features/join-codes/join/search";

export const Route = createFileRoute("/join/")({
  ssr: false,
  validateSearch: parseJoinSearch,
  head: () => ({ meta: [{ title: "Join your academy · Hoops Genesis" }] }),
  component: JoinIndexPage,
});

/** Enter a join code (Paper 6WQ-0 web, 6WS-0 phone), story ST-1. */
function JoinIndexPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const nav = useMemo<JoinNavigation>(
    () => ({
      toCode: (code) =>
        navigate({
          to: "/join/$code",
          params: { code },
          search: { as: search.as },
        }),
      toEnter: () => navigate({ to: "/join", search: { as: search.as } }),
      setSearch: (patch) =>
        navigate({
          to: "/join",
          search: (prev) => ({ ...prev, ...patch }),
          replace: true,
        }),
    }),
    [navigate, search.as]
  );
  return <JoinPage code={null} nav={nav} search={search} />;
}
