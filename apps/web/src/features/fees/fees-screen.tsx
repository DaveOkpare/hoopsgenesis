import { Button } from "@hoops-genesis/ui/components/button";
import {
  Eyebrow,
  PageActions,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { SearchInput } from "@hoops-genesis/ui/components/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hoops-genesis/ui/components/select";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from "@hoops-genesis/ui/components/tabs";
import { useQuery } from "@tanstack/react-query";
import { type ChangeEvent, type ReactNode, useCallback, useMemo } from "react";

import { PlusIcon } from "@/components/icons";
import { downloadCsv, toCsv } from "@/features/fees/export-csv";
import { PaymentsPanel } from "@/features/fees/payments-panel";
import {
  addMonths,
  isPeriodKey,
  methodLabel,
  type PeriodKey,
  periodKeyOf,
  periodLongLabel,
  periodMonthName,
  periodOf,
  periodShortLabel,
} from "@/features/fees/periods";
import {
  currentTime,
  type FeeSummary,
  feeSummaryQueryOptions,
  feesQueryOptions,
  feeTeamsQueryOptions,
  outstandingFeesQueryOptions,
  type PaymentRow,
} from "@/features/fees/queries";
import { RecordPaymentDialog } from "@/features/fees/record-payment-dialog";
import type { FeesSearch, FeesTab } from "@/features/fees/search";
import {
  groupUnpaid,
  TeamChips,
  type UnpaidGroup,
  UnpaidPanel,
} from "@/features/fees/unpaid-panel";
import { VoidPaymentDialog } from "@/features/fees/void-payment-dialog";
import type { Id } from "@/features/types";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";
import { formatAmount } from "@/lib/format";
import { useIsPhone } from "@/lib/use-is-phone";

const PERCENT = 100;
const ALL_TEAMS = "all";

/* ---------- Summary cards (desktop) ---------- */

function SummaryCard({
  label,
  unit,
  value,
  hint,
}: {
  label: string;
  unit: string;
  value: string;
  hint: ReactNode;
}) {
  return (
    <div className="flex flex-1 basis-0 flex-col gap-[10px] rounded-[20px] bg-fog px-[22px] py-5">
      <p className="font-medium text-muted text-sm leading-[18px]">{label}</p>
      <p className="flex items-baseline gap-[6px]">
        <span className="font-semibold text-[15px] text-muted leading-[18px]">
          {unit}
        </span>
        <span className="font-display text-2xl text-ink leading-[95%]">
          {value}
        </span>
      </p>
      {hint}
    </div>
  );
}

function FeeSummaryCards({ summary }: { summary: FeeSummary | undefined }) {
  if (!summary) {
    return (
      <div className="flex gap-4 max-md:hidden">
        <Skeleton className="h-[136px] flex-1 rounded-[20px]" />
        <Skeleton className="h-[136px] flex-1 rounded-[20px]" />
        <Skeleton className="h-[136px] flex-1 rounded-[20px]" />
      </div>
    );
  }
  const online = Math.round(summary.onlineShare * PERCENT);
  const month = periodMonthName(summary.period);
  return (
    <section aria-label="This month" className="flex gap-4 max-md:hidden">
      <SummaryCard
        hint={
          <p className="text-muted text-sm leading-[18px]">
            {summary.paidStudentCount} students paid
          </p>
        }
        label={`Collected in ${month}`}
        unit={summary.collected.currency}
        value={formatAmount(summary.collected.amount)}
      />
      <SummaryCard
        hint={
          <p className="font-semibold text-orange-deep text-sm leading-[18px]">
            {summary.unpaidStudentCount} students
          </p>
        }
        label="Outstanding"
        unit={summary.outstanding.currency}
        value={formatAmount(summary.outstanding.amount)}
      />
      <div className="flex flex-1 basis-0 flex-col gap-[10px] rounded-[20px] bg-fog px-[22px] py-5">
        <p className="font-medium text-muted text-sm leading-[18px]">
          Paid online vs cash
        </p>
        <div aria-hidden="true" className="flex gap-1 pt-[14px]">
          <div
            className="h-[10px] rounded-full bg-ink"
            style={{ width: `${online}%` }}
          />
          <div className="h-[10px] flex-1 rounded-full bg-[#C8C8C8]" />
        </div>
        <p className="pt-1 text-muted text-sm leading-[18px]">
          {online}% mobile money · {PERCENT - online}% cash
        </p>
      </div>
    </section>
  );
}

/* ---------- Toolbar controls ---------- */

function PeriodSelect({
  period,
  options,
  onChange,
}: {
  period: PeriodKey;
  options: PeriodKey[];
  onChange: (period: PeriodKey) => void;
}) {
  const items = useMemo(
    () => options.map((key) => ({ value: key, label: periodLongLabel(key) })),
    [options]
  );
  const handleChange = useCallback(
    (value: unknown) => {
      if (isPeriodKey(value)) {
        onChange(value);
      }
    },
    [onChange]
  );
  return (
    <Select items={items} onValueChange={handleChange} value={period}>
      <SelectTrigger
        aria-label="Period"
        className="py-[10px] max-md:shrink-0"
        variant="pill"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TeamSelect({
  teams,
  teamId,
  onChange,
}: {
  teams: { id: Id; name: string }[];
  teamId: Id | null;
  onChange: (teamId: Id | null) => void;
}) {
  const items = useMemo(
    () => [
      { value: ALL_TEAMS, label: "All teams" },
      ...teams.map((team) => ({ value: team.id, label: team.name })),
    ],
    [teams]
  );
  const handleChange = useCallback(
    (value: unknown) => {
      if (typeof value === "string") {
        onChange(value === ALL_TEAMS ? null : value);
      }
    },
    [onChange]
  );
  return (
    <Select
      items={items}
      onValueChange={handleChange}
      value={teamId ?? ALL_TEAMS}
    >
      <SelectTrigger aria-label="Team" className="py-[10px]" variant="pill">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ---------- Export ---------- */

function exportPayments(rows: PaymentRow[], period: PeriodKey) {
  const csv = toCsv(
    [
      "Student",
      "Team",
      "Period",
      "Paid on",
      "Method",
      "Reference",
      "Amount",
      "Currency",
      "Status",
      "Void reason",
    ],
    rows.map((row) => [
      row.student.name,
      row.student.teamName,
      periodShortLabel(periodKeyOf(row.periodStart)),
      row.paidAt?.slice(0, 10) ?? null,
      methodLabel(row.paymentMethod),
      row.paymentReference,
      Number(row.amount),
      row.currency,
      row.voidedAt ? "Voided" : "Paid",
      row.voidReason,
    ])
  );
  downloadCsv(`payments-${period}.csv`, csv);
}

function exportUnpaid(groups: UnpaidGroup[], period: PeriodKey) {
  const csv = toCsv(
    ["Team", "Student", "Last payment", "Days overdue", "Amount", "Currency"],
    groups.flatMap((group) =>
      group.rows.map((row) => [
        group.label,
        row.student.name,
        row.lastPaidAt?.slice(0, 10) ?? "Never",
        row.daysOverdue,
        Number(row.amount),
        row.currency,
      ])
    )
  );
  downloadCsv(`unpaid-${period}.csv`, csv);
}

/* ---------- Screen ---------- */

export function FeesScreen({
  search,
  onSearchChange,
}: {
  search: FeesSearch;
  onSearchChange: (patch: Partial<FeesSearch>) => void;
}) {
  const viewer = useViewer();
  const membership = useActiveMembership();
  const isPhone = useIsPhone();
  const academyId = membership?.academy.id ?? "";
  const timeZone = membership?.academy.timezone ?? "UTC";
  const viewerId = viewer.user.id;
  const now = currentTime();
  const thisPeriod = periodOf(now, timeZone);
  const periodOptions = useMemo(
    () => [0, -1, -2].map((offset) => addMonths(thisPeriod, offset)),
    [thisPeriod]
  );

  const tab: FeesTab = search.tab ?? (isPhone ? "unpaid" : "payments");
  const period = search.period ?? thisPeriod;
  const query = search.q ?? "";
  const teamId = search.team ?? null;

  const summary = useQuery(feeSummaryQueryOptions(academyId));
  const payments = useQuery(feesQueryOptions(academyId, period));
  const outstanding = useQuery(outstandingFeesQueryOptions(academyId));
  const teams = useQuery(feeTeamsQueryOptions(academyId));
  const allFees = useQuery({
    ...feesQueryOptions(academyId, null),
    enabled: Boolean(search.void),
  });

  const visiblePayments = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!(payments.data && needle)) {
      return payments.data;
    }
    return payments.data.filter(
      (row) =>
        row.student.name.toLowerCase().includes(needle) ||
        (row.paymentReference ?? "").toLowerCase().includes(needle)
    );
  }, [payments.data, query]);

  const unpaidGroups = useMemo(() => {
    if (!outstanding.data) {
      return;
    }
    const rows = teamId
      ? outstanding.data.filter((row) => row.teamId === teamId)
      : outstanding.data;
    return groupUnpaid(rows, now, timeZone);
  }, [outstanding.data, teamId, now, timeZone]);

  const teamCounts = useMemo(() => {
    const counts = new Map<Id | null, number>();
    for (const row of outstanding.data ?? []) {
      counts.set(row.teamId, (counts.get(row.teamId) ?? 0) + 1);
    }
    return counts;
  }, [outstanding.data]);

  const voidTarget = allFees.data?.find((row) => row.id === search.void);

  const handleTabChange = useCallback(
    (value: unknown) => {
      if (value === "payments" || value === "unpaid") {
        onSearchChange({ tab: value, highlight: undefined });
      }
    },
    [onSearchChange]
  );
  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onSearchChange({ q: event.target.value || undefined }),
    [onSearchChange]
  );
  const handlePeriodChange = useCallback(
    (next: PeriodKey) =>
      onSearchChange({
        period: next === thisPeriod ? undefined : next,
        highlight: undefined,
      }),
    [onSearchChange, thisPeriod]
  );
  const handleTeamChange = useCallback(
    (next: Id | null) => onSearchChange({ team: next ?? undefined }),
    [onSearchChange]
  );
  const handleRecord = useCallback(
    (studentId?: Id) => onSearchChange({ record: 1, student: studentId }),
    [onSearchChange]
  );
  const handleRecordNew = useCallback(() => handleRecord(), [handleRecord]);
  const handleRecordOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onSearchChange({ record: undefined, student: undefined });
      }
    },
    [onSearchChange]
  );
  const handleViewPayment = useCallback(
    (feeId: Id, feePeriod: PeriodKey) =>
      onSearchChange({
        record: undefined,
        student: undefined,
        tab: "payments",
        q: undefined,
        period: feePeriod === thisPeriod ? undefined : feePeriod,
        highlight: feeId,
      }),
    [onSearchChange, thisPeriod]
  );
  const handleVoid = useCallback(
    (feeId: Id) => onSearchChange({ void: feeId, highlight: undefined }),
    [onSearchChange]
  );
  const handleVoidOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onSearchChange({ void: undefined });
      }
    },
    [onSearchChange]
  );
  const handleExport = useCallback(() => {
    if (tab === "payments" && visiblePayments) {
      exportPayments(visiblePayments, period);
    } else if (tab === "unpaid" && unpaidGroups) {
      exportUnpaid(unpaidGroups, thisPeriod);
    }
  }, [tab, visiblePayments, unpaidGroups, period, thisPeriod]);

  const unpaidCount = summary.data?.unpaidStudentCount;

  return (
    <>
      <PageHeader>
        <PageHeading>
          <Eyebrow className="max-md:hidden">
            {periodLongLabel(thisPeriod)}
          </Eyebrow>
          <PageTitle>Fees</PageTitle>
        </PageHeading>
        <PageActions>
          <Button
            className="max-md:gap-[6px] max-md:px-4 max-md:py-[10px] max-md:text-sm"
            onClick={handleRecordNew}
          >
            <PlusIcon className="max-md:size-[14px]" />
            <span className="max-md:hidden">Record payment</span>
            <span className="md:hidden">Payment</span>
          </Button>
        </PageActions>
      </PageHeader>

      <FeeSummaryCards summary={summary.data} />

      <Tabs
        className="gap-8 max-md:gap-4"
        onValueChange={handleTabChange}
        value={tab}
      >
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger className="max-md:order-last" value="payments">
              Payments
            </TabsTrigger>
            <TabsTrigger value="unpaid">
              Unpaid
              {unpaidCount ? (
                <TabsCount tone="alert">{unpaidCount}</TabsCount>
              ) : null}
            </TabsTrigger>
          </TabsList>
          <div className="flex gap-2 max-md:hidden">
            {tab === "payments" ? (
              <>
                <SearchInput
                  aria-label="Search student or reference"
                  className="w-[240px]"
                  onChange={handleQueryChange}
                  placeholder="Search student or reference"
                  value={query}
                />
                <PeriodSelect
                  onChange={handlePeriodChange}
                  options={periodOptions}
                  period={period}
                />
              </>
            ) : (
              <TeamSelect
                onChange={handleTeamChange}
                teamId={teamId}
                teams={teams.data ?? []}
              />
            )}
            <Button
              className="py-[10px]"
              onClick={handleExport}
              size="toolbar"
              variant="outline"
            >
              Export
            </Button>
          </div>
        </div>

        <TabsContent className="flex flex-col gap-4" value="payments">
          <div className="flex gap-2 md:hidden">
            <SearchInput
              aria-label="Search student or reference"
              onChange={handleQueryChange}
              placeholder="Search student"
              value={query}
            />
            <PeriodSelect
              onChange={handlePeriodChange}
              options={periodOptions}
              period={period}
            />
          </div>
          <PaymentsPanel
            highlightId={search.highlight}
            isLoading={payments.isPending}
            onVoid={handleVoid}
            period={period}
            query={query}
            rows={visiblePayments}
            timeZone={timeZone}
            viewerId={viewerId}
          />
        </TabsContent>

        <TabsContent className="flex flex-col gap-4" value="unpaid">
          <TeamChips
            counts={teamCounts}
            onTeamChange={handleTeamChange}
            teamId={teamId}
            teams={teams.data ?? []}
          />
          <UnpaidPanel
            groups={unpaidGroups}
            isLoading={outstanding.isPending}
            onRecord={handleRecord}
            timeZone={timeZone}
          />
        </TabsContent>
      </Tabs>

      <RecordPaymentDialog
        academyId={academyId}
        initialStudentId={search.student}
        onOpenChange={handleRecordOpenChange}
        onViewPayment={handleViewPayment}
        open={Boolean(search.record)}
        timeZone={timeZone}
        viewerId={viewerId}
      />
      <VoidPaymentDialog
        academyId={academyId}
        fee={voidTarget}
        onOpenChange={handleVoidOpenChange}
        open={Boolean(search.void)}
        timeZone={timeZone}
        viewerId={viewerId}
      />
    </>
  );
}
