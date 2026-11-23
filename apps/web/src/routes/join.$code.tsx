import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  type JoinNavigation,
  JoinPage,
} from "@/features/join-codes/join/join-page";
import { parseJoinSearch } from "@/features/join-codes/join/search";

export const Route = createFileRoute("/join/$code")({
  ssr: false,
  validateSearch: parseJoinSearch,
  head: () => ({ meta: [{ title: "Join your academy · Hoops Genesis" }] }),
  component: JoinCodePage,
});

/*
 * A code from a link (/join/K7PM-4QXR-9TWC): skips typing and goes straight to the
 * check. Confirm 6WR-0 / 6WT-0; problems 6WU-0; "You're in" with ?state=joined.
 * Fixture codes for each state: features/join-codes/fixtures.ts.
 */
function JoinCodePage() {
  const { code } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const nav = useMemo<JoinNavigation>(
    () => ({
      toCode: (next) =>
        navigate({
          to: "/join/$code",
          params: { code: next },
          search: { as: search.as },
        }),
      toEnter: () => navigate({ to: "/join", search: { as: search.as } }),
      setSearch: (patch) =>
        navigate({
          to: "/join/$code",
          params: { code },
          search: (prev) => ({ ...prev, ...patch }),
          replace: true,
        }),
    }),
    [code, navigate, search.as]
  );
  return <JoinPage code={code} nav={nav} search={search} />;
}
