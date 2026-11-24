import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { parsePage, parsePerPage } from "@/components/owner/pager";
import {
  DATE_OPTIONS,
  OwnerAuditScreen,
  type OwnerAuditSearch,
  type OwnerAuditSearchChange,
  TYPE_OPTIONS,
} from "@/features/owner-audit/audit-screen";

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export const Route = createFileRoute("/_auth/owner/audit")({
  validateSearch: (raw: Record<string, unknown>): OwnerAuditSearch => {
    const type = TYPE_OPTIONS.find((o) => o.value === raw.type)?.value;
    const date = DATE_OPTIONS.find((o) => o.value === raw.date)?.value;
    return {
      academy: optionalString(raw.academy),
      person: optionalString(raw.person),
      type: type === "all" ? undefined : type,
      date: date === "30d" ? undefined : date,
      page: parsePage(raw.page),
      per: parsePerPage(raw.per),
    };
  },
  component: AuditLogPage,
});

function AuditLogPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onSearchChange: OwnerAuditSearchChange = useCallback(
    (patch, options) =>
      navigate({
        search: (prev) => ({
          ...prev,
          ...((options?.resetPage ?? true) ? { page: undefined } : {}),
          ...patch,
        }),
        replace: true,
        resetScroll: false,
      }),
    [navigate]
  );
  // A new filter set starts with its newest entry open again.
  const key = [search.academy, search.person, search.type, search.date].join();
  return (
    <OwnerAuditScreen
      key={key}
      onSearchChange={onSearchChange}
      search={search}
    />
  );
}
