import { Badge } from "@hoops-genesis/ui/components/badge";
import { buttonVariants } from "@hoops-genesis/ui/components/button";
import { CountryDot } from "@hoops-genesis/ui/components/chip";
import {
  List,
  ListRow,
  ListRowChevron,
  ListRowContent,
  ListRowDescription,
  ListRowTitle,
} from "@hoops-genesis/ui/components/list";
import {
  Eyebrow,
  PageActions,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { QueryBoundary } from "@/components/error-state";
import { PlusIcon } from "@/components/icons";
import { AcademyDetail } from "@/features/owner-academies/academy-detail";
import {
  type PlatformAcademy,
  type PlatformAcademyStatus,
  platformAcademiesQueryOptions,
} from "@/features/owner-academies/queries";
import type { Id } from "@/features/types";
import { academyCountry, countryName } from "@/features/viewer/selectors";

const STATUS: Record<
  PlatformAcademyStatus,
  { label: string; variant: "neutral" | "warning" | "line" }
> = {
  active: { label: "Active", variant: "neutral" },
  qr_replaced: { label: "QR replaced", variant: "warning" },
  admin_invited: { label: "Admin invited", variant: "line" },
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function subtitle(row: PlatformAcademy): string {
  const country = countryName(academyCountry(row.academy));
  return row.adminName
    ? `${country} · Admin ${row.adminName}`
    : `${country} · No admin yet`;
}

function AcademyTile({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-[12px] font-display text-lg leading-[22px]",
        selected ? "bg-orange text-ink" : "bg-ink text-white"
      )}
    >
      HG
    </span>
  );
}

function StatusBadge({ status }: { status: PlatformAcademyStatus }) {
  const { label, variant } = STATUS[status];
  return (
    <Badge
      className={cn(variant === "neutral" && "text-ink-soft")}
      variant={variant}
    >
      {label}
    </Badge>
  );
}

/** Desktop card row: tile, name + country, member count, status pill. */
function AcademyCard({
  row,
  selected,
}: {
  row: PlatformAcademy;
  selected: boolean;
}) {
  return (
    <Link
      aria-current={selected ? "page" : undefined}
      className={cn(
        "flex items-center gap-[14px] rounded-md p-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
        selected
          ? "border-2 border-ink"
          : "border border-line hover:border-stone hover:bg-fog/50"
      )}
      params={{ academyId: row.academy.id }}
      to="/owner/academies/$academyId"
    >
      <AcademyTile selected={selected} />
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="truncate font-semibold text-base text-ink leading-5">
          {row.academy.name}
        </span>
        <span className="flex items-center gap-[6px]">
          <CountryDot country={academyCountry(row.academy)} />
          <span className="truncate text-muted text-sm leading-[18px]">
            {subtitle(row)}
          </span>
        </span>
      </span>
      <span className="flex w-[90px] shrink-0 flex-col items-end">
        <span className="font-semibold text-base text-ink leading-5">
          {row.memberCount}
        </span>
        <span className="text-[13px] text-muted leading-4">members</span>
      </span>
      <span className="flex w-[120px] shrink-0 justify-end">
        <StatusBadge status={row.status} />
      </span>
    </Link>
  );
}

/** Phone row: same facts on two lines, the whole row opens the academy page. */
function AcademyListRow({ row }: { row: PlatformAcademy }) {
  return (
    <ListRow
      render={
        <Link
          params={{ academyId: row.academy.id }}
          to="/owner/academies/$academyId"
        />
      }
    >
      <AcademyTile selected={false} />
      <ListRowContent>
        <ListRowTitle>{row.academy.name}</ListRowTitle>
        <ListRowDescription className="flex items-center gap-[6px]">
          <CountryDot country={academyCountry(row.academy)} />
          <span className="truncate">
            {row.adminName ? `Admin ${row.adminName}` : "No admin yet"} ·{" "}
            {plural(row.memberCount, "member", "members")}
          </span>
        </ListRowDescription>
      </ListRowContent>
      <StatusBadge status={row.status} />
      <ListRowChevron />
    </ListRow>
  );
}

/**
 * "[Owner] Academies console" (PA-3). The detail is a side panel on desktop and its
 * own page on phones; `/owner/academies/$academyId` is the deep link to a selection,
 * `/owner` selects the first academy.
 */
export function AcademyConsole({ academyId }: { academyId?: Id }) {
  const { data: rows } = useSuspenseQuery(platformAcademiesQueryOptions());
  const selectedId = academyId ?? rows[0]?.academy.id;
  const isDetailPage = Boolean(academyId);
  const countries = new Set(rows.map((r) => academyCountry(r.academy))).size;
  const createLink = (
    <Link className={buttonVariants()} to="/owner/academies/new">
      <PlusIcon />
      Create academy
    </Link>
  );

  return (
    <>
      <PageHeader className={cn(isDetailPage && "max-md:hidden")}>
        <PageHeading>
          <Eyebrow>
            {plural(rows.length, "academy", "academies")} ·{" "}
            {plural(countries, "country", "countries")}
          </Eyebrow>
          <PageTitle>Academies</PageTitle>
        </PageHeading>
        <PageActions className="max-md:hidden">{createLink}</PageActions>
      </PageHeader>

      {isDetailPage ? (
        <Link
          className="font-medium text-[13px] text-muted uppercase leading-4 tracking-label md:hidden"
          to="/owner"
        >
          ← Academies
        </Link>
      ) : null}

      <div className="flex w-full items-start gap-4">
        <nav
          aria-label="Academies"
          className="flex min-w-0 flex-1 flex-col gap-2 max-md:hidden"
        >
          {rows.map((row) => (
            <AcademyCard
              key={row.academy.id}
              row={row}
              selected={row.academy.id === selectedId}
            />
          ))}
        </nav>
        {selectedId ? (
          <QueryBoundary
            className={cn(
              "w-[440px] shrink-0 self-start max-md:w-full max-lg:w-[360px]",
              !isDetailPage && "max-md:hidden"
            )}
            resetKey={selectedId}
            what="this academy"
          >
            <AcademyDetail
              academyId={selectedId}
              className={cn(
                "w-[440px] shrink-0 max-md:w-full max-lg:w-[360px]",
                !isDetailPage && "max-md:hidden"
              )}
            />
          </QueryBoundary>
        ) : null}
      </div>

      {isDetailPage ? null : (
        <div className="flex flex-col gap-[18px] md:hidden">
          <List aria-label="Academies">
            {rows.map((row) => (
              <AcademyListRow key={row.academy.id} row={row} />
            ))}
          </List>
          <Link
            className={cn(
              buttonVariants({ size: "xl" }),
              "w-full text-[17px] leading-[22px]"
            )}
            to="/owner/academies/new"
          >
            <PlusIcon />
            Create academy
          </Link>
        </div>
      )}
    </>
  );
}
