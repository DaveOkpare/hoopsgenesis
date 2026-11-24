/*
 * URL state for /admin/fees, so every tab, filter and dialog can be linked to:
 *   ?tab=unpaid&team=team-u14        Unpaid tab filtered to U14
 *   ?period=2026-10&q=jean           Payments for October matching "jean"
 *   ?record=1&student=user-jean      Record payment dialog, student picked
 *   ?void=fee-samuel-m-nov           Void payment dialog for that fee
 *   ?fee=<feeId>                     Payment detail panel (GS7-0, H06-0; GOA-0 page on phones)
 *   ?page=2                          Second page of payments (25 a page)
 *   ?highlight=<feeId>               Row highlighted
 */
import { isPeriodKey, type PeriodKey } from "@/features/fees/periods";

export type FeesTab = "payments" | "unpaid";

export interface FeesSearch {
  fee?: string;
  highlight?: string;
  page?: number;
  period?: PeriodKey;
  q?: string;
  record?: 1;
  student?: string;
  tab?: FeesTab;
  team?: string;
  void?: string;
}

function text(value: unknown): string | undefined {
  if (typeof value === "number") {
    return String(value);
  }
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function pageOf(value: unknown): number | undefined {
  const page = Number(value);
  return Number.isInteger(page) && page > 1 ? page : undefined;
}

export function parseFeesSearch(raw: Record<string, unknown>): FeesSearch {
  const tab =
    raw.tab === "payments" || raw.tab === "unpaid" ? raw.tab : undefined;
  const record =
    raw.record === true || raw.record === 1 || raw.record === "1"
      ? 1
      : undefined;
  return {
    tab,
    period: isPeriodKey(raw.period) ? raw.period : undefined,
    q: text(raw.q),
    team: text(raw.team),
    record,
    student: text(raw.student),
    void: text(raw.void),
    highlight: text(raw.highlight),
    fee: text(raw.fee),
    page: pageOf(raw.page),
  };
}
