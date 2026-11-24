/*
 * URL state of the academies console (`/owner` and `/owner/academies/$academyId`):
 * search text, country, sort, page and page size, so a filtered page is a link.
 *
 * The list endpoint (`GET /api/v1/admin/academies`) has no search, filter or sort
 * parameters, only `limit` + `cursor`. The console therefore loads every academy
 * (all pages, `apiAll`) and searches, filters, sorts and pages in the browser over
 * the whole list, so counts and page numbers are exact.
 */

import {
  DEFAULT_PER_PAGE,
  type PerPage,
  parsePage,
  parsePerPage,
} from "@/components/owner/pager";
import type { PlatformAcademy } from "@/features/owner-academies/queries";
import type { Country } from "@/features/types";

export type AcademySort = "newest" | "name" | "members";
export type CountryFilter = Country | "other";

export interface ConsoleSearch {
  country?: CountryFilter;
  page?: number;
  per?: PerPage;
  q?: string;
  sort?: AcademySort;
}

export const SORT_OPTIONS: { value: AcademySort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "name", label: "Name, A to Z" },
  { value: "members", label: "Most members first" },
];

const COUNTRY_BY_TIMEZONE: Record<string, Country> = {
  "Asia/Kolkata": "india",
  "Africa/Kigali": "rwanda",
  "Africa/Kampala": "uganda",
};

export const COUNTRY_LABEL: Record<CountryFilter, string> = {
  rwanda: "Rwanda",
  india: "India",
  uganda: "Uganda",
  other: "Other",
};

const COUNTRIES: CountryFilter[] = ["rwanda", "india", "uganda", "other"];

/** The academy's country from its time zone; null outside the three we operate in. */
export function knownCountry(timeZone: string): Country | null {
  return COUNTRY_BY_TIMEZONE[timeZone] ?? null;
}

/** "Rwanda", or the time zone's city ("Lagos") for anywhere else. */
export function placeLabel(timeZone: string): string {
  const country = knownCountry(timeZone);
  if (country) {
    return COUNTRY_LABEL[country];
  }
  return (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
}

function countryOf(row: PlatformAcademy): CountryFilter {
  return knownCountry(row.academy.timezone) ?? "other";
}

export function parseConsoleSearch(
  raw: Record<string, unknown>
): ConsoleSearch {
  const q = typeof raw.q === "string" && raw.q ? raw.q : undefined;
  const country = COUNTRIES.find((c) => c === raw.country);
  const sort = SORT_OPTIONS.find((o) => o.value === raw.sort)?.value;
  const per = parsePerPage(raw.per);
  return {
    q,
    country,
    sort: sort === "newest" ? undefined : sort,
    page: parsePage(raw.page),
    per: per === DEFAULT_PER_PAGE ? undefined : per,
  };
}

/** Countries present in the list, in a fixed order, for the filter. */
export function countriesIn(rows: PlatformAcademy[]): CountryFilter[] {
  const present = new Set(rows.map(countryOf));
  return COUNTRIES.filter((c) => present.has(c));
}

function matches(row: PlatformAcademy, needle: string): boolean {
  const haystack = [
    row.academy.name,
    row.academy.location ?? "",
    row.academy.slug,
    ...row.admins.flatMap((admin) => [admin.name, admin.email]),
    row.pendingAdminEmail ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

const COMPARE: Record<
  AcademySort,
  ((a: PlatformAcademy, b: PlatformAcademy) => number) | null
> = {
  // The server's order is newest first already.
  newest: null,
  name: (a, b) => a.academy.name.localeCompare(b.academy.name),
  members: (a, b) => b.memberCount - a.memberCount,
};

/** Search, country filter and sort over the whole list. */
export function applyConsoleSearch(
  rows: PlatformAcademy[],
  search: ConsoleSearch
): PlatformAcademy[] {
  const needle = search.q?.trim().toLowerCase() ?? "";
  const filtered = rows.filter(
    (row) =>
      (!needle || matches(row, needle)) &&
      (!search.country || countryOf(row) === search.country)
  );
  const compare = COMPARE[search.sort ?? "newest"];
  return compare ? [...filtered].sort(compare) : filtered;
}
