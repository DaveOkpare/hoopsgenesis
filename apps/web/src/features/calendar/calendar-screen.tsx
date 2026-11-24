/*
 * Calendar for academy admins and coaches (CO-2, CO-6, ST-8).
 * Admin: Paper 8BX-0 (web), 7HO-0 (phone). Coach: 8M9-0 (web), C3W-0 (phone).
 * Admins see the whole academy; coaches academy-wide events and their teams' (the server
 * scopes GET /events). Below 1024px the side panel moves under the grid.
 */
import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import {
  Eyebrow,
  PageActions,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hoops-genesis/ui/components/select";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import { MobileAcademyBar } from "@/components/app-shell/academy-switcher";
import { PlusIcon } from "@/components/icons";
import { AgendaDays, PhoneMonth, WeekStrip } from "@/features/calendar/agenda";
import { CancelDayDialog } from "@/features/calendar/cancel-day-dialog";
import { ArrowButton, Segmented, TeamChip } from "@/features/calendar/controls";
import {
  addDays,
  addMonths,
  DAYS_IN_WEEK,
  eachDay,
  firstOfMonth,
  lastOfMonth,
  type MonthKey,
  monthGridRange,
  monthLabel,
  monthName,
  monthOf,
  startOfWeek,
  toDateOnly,
  weekdayDayMonth,
} from "@/features/calendar/dates";
import {
  AdminDayPanel,
  CoachDayPanel,
  NextUp,
} from "@/features/calendar/day-panel";
import {
  type CalendarRole,
  EVENT_TYPE_OPTIONS,
  filterItems,
  groupByDay,
  indexTeams,
  type TeamIndex,
  teamNames,
} from "@/features/calendar/model";
import { MonthGrid } from "@/features/calendar/month-grid";
import {
  type CalendarItem,
  type CalendarTeam,
  calendarItemsQueryOptions,
  calendarTeamsQueryOptions,
} from "@/features/calendar/queries";
import {
  ACADEMY_WIDE,
  type CalendarSearch,
  type CalendarView,
} from "@/features/calendar/search";
import type { DateOnly } from "@/features/types";
import { useActiveMembership } from "@/features/viewer/queries";
import { appNow } from "@/lib/preview";

type SearchPatch = Partial<CalendarSearch>;

const VIEW_OPTIONS = [
  { value: "month", label: "Month" },
  { value: "agenda", label: "Agenda" },
] as const;

const PHONE_VIEW_OPTIONS = [
  { value: "agenda", label: "Agenda" },
  { value: "month", label: "Month" },
] as const;

const ALL_TYPES = "all";

function NewEventLink({
  role,
  date,
  className,
  label = "New event",
}: {
  role: CalendarRole;
  date: DateOnly;
  className?: string;
  label?: string;
}) {
  const classes = cn(buttonVariants(), className);
  return role === "admin" ? (
    <Link className={classes} search={{ date }} to="/admin/calendar/new">
      <PlusIcon />
      {label}
    </Link>
  ) : (
    <Link className={classes} search={{ date }} to="/coach/calendar/new">
      <PlusIcon />
      {label}
    </Link>
  );
}

function TeamChips({
  role,
  teams,
  value,
  onChange,
  withAcademyWide,
  withDots,
}: {
  role: CalendarRole;
  teams: CalendarTeam[];
  value: string | undefined;
  onChange: (team: string | undefined) => void;
  withAcademyWide?: boolean;
  withDots?: boolean;
}) {
  const handleAll = useCallback(() => onChange(undefined), [onChange]);
  const handleAcademy = useCallback(() => onChange(ACADEMY_WIDE), [onChange]);
  return (
    <>
      <TeamChip onClick={handleAll} selected={!value}>
        {role === "admin" ? "All teams" : "All my teams"}
      </TeamChip>
      {teams.map((team) => (
        <TeamChipFor
          key={team.id}
          onChange={onChange}
          selected={value === team.id}
          team={team}
          withDot={withDots}
        />
      ))}
      {withAcademyWide ? (
        <TeamChip onClick={handleAcademy} selected={value === ACADEMY_WIDE}>
          Academy-wide
        </TeamChip>
      ) : null}
    </>
  );
}

function TeamChipFor({
  team,
  selected,
  onChange,
  withDot,
}: {
  team: CalendarTeam;
  selected: boolean;
  onChange: (team: string | undefined) => void;
  withDot?: boolean;
}) {
  const handleClick = useCallback(
    () => onChange(selected ? undefined : team.id),
    [onChange, selected, team.id]
  );
  return (
    <TeamChip
      onClick={handleClick}
      selected={selected}
      tone={withDot ? team.tone : undefined}
    >
      {team.name}
    </TeamChip>
  );
}

function TypeSelect({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (type: string | undefined) => void;
}) {
  const items = useMemo(
    () => [{ value: ALL_TYPES, label: "All types" }, ...EVENT_TYPE_OPTIONS],
    []
  );
  const handleChange = useCallback(
    (next: unknown) =>
      onChange(
        typeof next === "string" && next !== ALL_TYPES ? next : undefined
      ),
    [onChange]
  );
  return (
    <Select
      items={items}
      onValueChange={handleChange}
      value={value ?? ALL_TYPES}
    >
      <SelectTrigger
        aria-label="Event type"
        className="px-[13px] py-2 text-[13px] leading-4"
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

function GridSkeleton() {
  return (
    <div className="flex items-start gap-6 max-lg:flex-col">
      <Skeleton className="h-[716px] w-full flex-1 rounded-[20px] max-lg:h-[560px]" />
      <Skeleton className="h-[420px] w-[300px] shrink-0 rounded-[20px] max-lg:w-full" />
    </div>
  );
}

function PhoneSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-[70px] w-full rounded-[14px]" />
      {["a", "b", "c", "d"].map((key) => (
        <Skeleton className="h-14 w-full rounded-[14px]" key={key} />
      ))}
    </div>
  );
}

interface CalendarModel {
  days: Map<DateOnly, CalendarItem[]>;
  items: CalendarItem[];
  teamIndex: TeamIndex;
  teams: CalendarTeam[];
}

function DesktopCalendar({
  role,
  model,
  loading,
  month,
  selected,
  today,
  view,
  search,
  timeZone,
  now,
  onSearchChange,
}: {
  role: CalendarRole;
  model: CalendarModel | null;
  loading: boolean;
  month: MonthKey;
  selected: DateOnly;
  today: DateOnly;
  view: CalendarView;
  search: CalendarSearch;
  timeZone: string;
  now: Date;
  onSearchChange: (patch: SearchPatch) => void;
}) {
  const goMonth = useCallback(
    (delta: number) => {
      const next = addMonths(month, delta);
      onSearchChange({
        month: next,
        day: monthOf(today) === next ? undefined : firstOfMonth(next),
      });
    },
    [month, onSearchChange, today]
  );
  const handlePrev = useCallback(() => goMonth(-1), [goMonth]);
  const handleNext = useCallback(() => goMonth(1), [goMonth]);
  const handleToday = useCallback(
    () => onSearchChange({ month: undefined, day: undefined }),
    [onSearchChange]
  );
  const handleView = useCallback(
    (next: CalendarView) => onSearchChange({ view: next }),
    [onSearchChange]
  );
  const handleTeam = useCallback(
    (team: string | undefined) => onSearchChange({ team }),
    [onSearchChange]
  );
  const handleType = useCallback(
    (type: string | undefined) => onSearchChange({ type }),
    [onSearchChange]
  );
  const handleSelect = useCallback(
    (day: DateOnly) => onSearchChange({ day, month }),
    [month, onSearchChange]
  );
  const handleCancel = useCallback(
    (key: string) => onSearchChange({ cancel: key }),
    [onSearchChange]
  );

  const nav = (
    <div className="flex items-center gap-[6px]">
      <ArrowButton
        className={role === "coach" ? "size-9" : undefined}
        direction="left"
        label="Previous month"
        onClick={handlePrev}
      />
      <ArrowButton
        className={role === "coach" ? "size-9" : undefined}
        direction="right"
        label="Next month"
        onClick={handleNext}
      />
      <h2
        aria-live="polite"
        className={cn(
          "pl-2 font-semibold text-ink",
          role === "admin"
            ? "text-[17px] leading-[22px]"
            : "pl-[10px] text-lg leading-6"
        )}
      >
        {monthLabel(month)}
      </h2>
      {role === "coach" ? (
        <button
          className="cursor-pointer pl-1 font-medium text-ink text-sm leading-[18px] underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ink"
          onClick={handleToday}
          type="button"
        >
          Today
        </button>
      ) : null}
    </div>
  );
  const viewSwitch = (
    <Segmented
      label="Calendar view"
      onChange={handleView}
      options={VIEW_OPTIONS}
      size={role === "coach" ? "sm" : "default"}
      value={view}
    />
  );
  const chips = model ? (
    <div className="flex flex-wrap items-center gap-[6px]">
      <TeamChips
        onChange={handleTeam}
        role={role}
        teams={model.teams}
        value={search.team}
        withDots={role === "admin"}
      />
      {role === "admin" ? (
        <TypeSelect onChange={handleType} value={search.type} />
      ) : null}
    </div>
  ) : null;

  const monthDates = eachDay(firstOfMonth(month), lastOfMonth(month));
  const dayItems = model?.days.get(selected) ?? [];

  return (
    <div className="flex flex-col gap-8 max-md:hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {role === "admin" ? (
          <div className="flex items-center gap-4">
            {viewSwitch}
            {nav}
          </div>
        ) : (
          nav
        )}
        <div className="flex flex-wrap items-center gap-3">
          {chips}
          {role === "coach" ? viewSwitch : null}
        </div>
      </div>
      {model ? (
        <div className="flex items-start gap-6 max-lg:flex-col">
          {view === "month" ? (
            <MonthGrid
              days={model.days}
              loading={loading}
              month={month}
              onSelect={handleSelect}
              role={role}
              selected={selected}
              teams={model.teamIndex}
              today={today}
            />
          ) : (
            <div className="min-w-0 flex-1 basis-0 max-lg:w-full max-lg:flex-none">
              {monthDates.some((date) => model.days.has(date)) ? (
                <AgendaDays
                  dates={monthDates}
                  days={model.days}
                  now={now}
                  role={role}
                  teams={model.teamIndex}
                  today={today}
                />
              ) : (
                <EmptyRange
                  date={selected}
                  label="Nothing this month"
                  next={nextAfter(model.items, lastOfMonth(month))}
                  onJump={handleSelect}
                  role={role}
                />
              )}
            </div>
          )}
          {role === "admin" ? (
            <AdminDayPanel
              date={selected}
              items={dayItems}
              now={now}
              teams={model.teamIndex}
              today={today}
            />
          ) : (
            <div className="flex w-[360px] shrink-0 flex-col gap-5 max-lg:w-full">
              <CoachDayPanel
                date={selected}
                dayItems={dayItems}
                items={model.items}
                now={now}
                onCancel={handleCancel}
                teams={model.teamIndex}
                timeZone={timeZone}
                today={today}
              />
              <NextUp
                items={model.items}
                now={now}
                teams={model.teamIndex}
                today={today}
              />
            </div>
          )}
        </div>
      ) : (
        <GridSkeleton />
      )}
    </div>
  );
}

function nextAfter(items: CalendarItem[], date: DateOnly): CalendarItem | null {
  return (
    items.find((item) => item.sessionDate > date && !item.cancelled) ?? null
  );
}

/** "Nothing on this week" (spec AGW-0): say so, offer New event, point to the next one. */
function EmptyRange({
  label,
  date,
  role,
  next,
  onJump,
  teams,
}: {
  label: string;
  /** Day the New event form starts on. */
  date: DateOnly;
  role: CalendarRole;
  next: CalendarItem | null;
  onJump: (date: DateOnly) => void;
  teams?: TeamIndex;
}) {
  const handleJump = useCallback(() => {
    if (next) {
      onJump(next.sessionDate);
    }
  }, [next, onJump]);
  const team = next?.teamId ? teams?.get(next.teamId) : undefined;
  return (
    <div className="flex flex-col gap-2 rounded-[20px] border border-line p-6">
      <p className="font-semibold text-base text-ink leading-5">{label}</p>
      <p className="text-muted text-sm leading-5">
        Add training, a match or a camp.
        {next ? (
          <>
            {" "}
            Next event: {weekdayDayMonth(next.sessionDate)}
            {team ? `, ${team.name} ${next.title.toLowerCase()}` : ""}.{" "}
            <button
              className="cursor-pointer font-semibold text-ink underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ink"
              onClick={handleJump}
              type="button"
            >
              Jump to it
            </button>
          </>
        ) : null}
      </p>
      <NewEventLink className="mt-2 w-fit" date={date} role={role} />
    </div>
  );
}

function PhoneCalendar({
  role,
  model,
  month,
  selected,
  today,
  view,
  search,
  now,
  onSearchChange,
}: {
  role: CalendarRole;
  model: CalendarModel | null;
  month: MonthKey;
  selected: DateOnly;
  today: DateOnly;
  view: CalendarView;
  search: CalendarSearch;
  now: Date;
  onSearchChange: (patch: SearchPatch) => void;
}) {
  const handleView = useCallback(
    (next: CalendarView) => onSearchChange({ view: next }),
    [onSearchChange]
  );
  const handleTeam = useCallback(
    (team: string | undefined) => onSearchChange({ team }),
    [onSearchChange]
  );
  const handleDay = useCallback(
    (day: DateOnly) =>
      onSearchChange({
        day: day === today ? undefined : day,
        month: undefined,
      }),
    [onSearchChange, today]
  );
  const handleMonthDay = useCallback(
    (day: DateOnly) => onSearchChange({ day, month }),
    [month, onSearchChange]
  );
  const handleWeek = useCallback(
    (delta: number) =>
      onSearchChange({
        day: addDays(selected, delta * DAYS_IN_WEEK),
        month: undefined,
      }),
    [onSearchChange, selected]
  );
  const handlePrevWeek = useCallback(() => handleWeek(-1), [handleWeek]);
  const handleNextWeek = useCallback(() => handleWeek(1), [handleWeek]);
  const handleMonth = useCallback(
    (delta: number) => {
      const next = addMonths(month, delta);
      onSearchChange({
        month: next,
        day: monthOf(today) === next ? undefined : firstOfMonth(next),
      });
    },
    [month, onSearchChange, today]
  );
  const handlePrevMonth = useCallback(() => handleMonth(-1), [handleMonth]);
  const handleNextMonth = useCallback(() => handleMonth(1), [handleMonth]);

  if (!model) {
    return (
      <div className="md:hidden">
        <PhoneSkeleton />
      </div>
    );
  }
  const weekStart = startOfWeek(selected);
  const weekEnd = addDays(weekStart, DAYS_IN_WEEK - 1);
  const weekDates = eachDay(selected, weekEnd);
  const weekHasItems = weekDates.some((date) => model.days.has(date));

  return (
    <div className="flex flex-col gap-4 md:hidden">
      {role === "admin" ? (
        <Segmented
          label="Calendar view"
          onChange={handleView}
          options={PHONE_VIEW_OPTIONS}
          value={view}
        />
      ) : null}
      {view === "month" ? (
        <>
          <div className="flex items-center justify-between">
            <ArrowButton
              direction="left"
              label="Previous month"
              onClick={handlePrevMonth}
            />
            <h2 className="font-semibold text-[17px] text-ink leading-[22px]">
              {monthLabel(month)}
            </h2>
            <ArrowButton
              direction="right"
              label="Next month"
              onClick={handleNextMonth}
            />
          </div>
          <PhoneMonth
            days={model.days}
            month={month}
            onSelect={handleMonthDay}
            selected={selected}
            teams={model.teamIndex}
            today={today}
          />
        </>
      ) : (
        <WeekStrip
          days={model.days}
          onSelect={handleDay}
          role={role}
          selected={selected}
          teams={model.teamIndex}
          today={today}
        />
      )}
      {role === "admin" ? (
        <div className="-mr-5 flex gap-2 overflow-x-auto pr-5 [scrollbar-width:none]">
          <TeamChips
            onChange={handleTeam}
            role={role}
            teams={model.teams}
            value={search.team}
            withAcademyWide
          />
        </div>
      ) : null}
      {view === "month" ? (
        <AgendaDays
          dates={[selected]}
          days={model.days}
          keepEmpty={selected}
          now={now}
          role={role}
          teams={model.teamIndex}
          today={today}
        />
      ) : (
        <>
          {weekHasItems ? (
            <AgendaDays
              dates={weekDates}
              days={model.days}
              keepEmpty={selected}
              now={now}
              role={role}
              teams={model.teamIndex}
              today={today}
            />
          ) : (
            <EmptyRange
              date={selected}
              label="Nothing on this week"
              next={nextAfter(model.items, weekEnd)}
              onJump={handleDay}
              role={role}
              teams={model.teamIndex}
            />
          )}
          <div className="flex justify-between">
            <Button onClick={handlePrevWeek} size="sm" variant="ghost">
              Previous week
            </Button>
            <Button onClick={handleNextWeek} size="sm" variant="ghost">
              Next week
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function eyebrows(
  role: CalendarRole,
  academyName: string,
  month: MonthKey,
  teams: CalendarTeam[] | undefined
): { desktop: string; phone: string } {
  const names = teams ? teamNames(teams) : "";
  if (role === "admin") {
    const count = teams
      ? ` · ${teams.length} ${teams.length === 1 ? "team" : "teams"}`
      : "";
    return { desktop: `${academyName}${count}`, phone: monthLabel(month) };
  }
  return {
    desktop: [monthLabel(month), names].filter(Boolean).join(" · "),
    phone: [monthName(month), names].filter(Boolean).join(" · "),
  };
}

export function CalendarScreen({
  audience: role,
  search,
  onSearchChange,
}: {
  /** Admin (whole academy) or coach (their teams). */
  audience: CalendarRole;
  search: CalendarSearch;
  onSearchChange: (patch: SearchPatch) => void;
}) {
  const membership = useActiveMembership();
  const academyId = membership?.academy.id ?? "";
  const academyName = membership?.academy.name ?? "";
  const timeZone = membership?.academy.timezone ?? "UTC";
  const now = appNow();
  const today = toDateOnly(now, timeZone);
  const selected = search.day ?? today;
  const month = search.month ?? monthOf(selected);
  const range = useMemo(() => monthGridRange(month), [month]);

  const teamsQuery = useQuery(calendarTeamsQueryOptions(academyId));
  const itemsQuery = useQuery(calendarItemsQueryOptions(academyId, range));

  const model = useMemo<CalendarModel | null>(() => {
    if (!(teamsQuery.data && itemsQuery.data)) {
      return null;
    }
    const filtered = filterItems(itemsQuery.data, {
      team: search.team,
      type: search.type,
    });
    return {
      teams: teamsQuery.data,
      teamIndex: indexTeams(teamsQuery.data),
      items: filtered,
      days: groupByDay(filtered),
    };
  }, [itemsQuery.data, search.team, search.type, teamsQuery.data]);

  const cancelItem = search.cancel
    ? itemsQuery.data?.find((item) => item.key === search.cancel)
    : undefined;
  const handleCloseCancel = useCallback(
    () => onSearchChange({ cancel: undefined }),
    [onSearchChange]
  );

  const { desktop: desktopEyebrow, phone: phoneEyebrow } = eyebrows(
    role,
    academyName,
    month,
    teamsQuery.data
  );

  return (
    <>
      {role === "coach" ? <MobileAcademyBar /> : null}
      <PageHeader>
        <PageHeading>
          <Eyebrow>
            <span className="max-md:hidden">{desktopEyebrow}</span>
            <span className="md:hidden">{phoneEyebrow}</span>
          </Eyebrow>
          <PageTitle>Calendar</PageTitle>
        </PageHeading>
        <PageActions>
          <NewEventLink className="max-md:hidden" date={selected} role={role} />
          {role === "admin" ? (
            <NewEventLink
              className="h-auto px-4 py-[10px] text-sm md:hidden"
              date={selected}
              label="Event"
              role={role}
            />
          ) : null}
        </PageActions>
      </PageHeader>
      <DesktopCalendar
        loading={itemsQuery.isPlaceholderData}
        model={model}
        month={month}
        now={now}
        onSearchChange={onSearchChange}
        role={role}
        search={search}
        selected={selected}
        timeZone={timeZone}
        today={today}
        view={search.view ?? "month"}
      />
      <PhoneCalendar
        model={model}
        month={month}
        now={now}
        onSearchChange={onSearchChange}
        role={role}
        search={search}
        selected={selected}
        today={today}
        view={role === "admin" ? (search.view ?? "agenda") : "agenda"}
      />
      {role === "coach" ? (
        <NewEventLink
          className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-30 h-auto px-5 py-[14px] text-[15px] shadow-[0_8px_20px_#11111133] md:hidden"
          date={selected}
          role={role}
        />
      ) : null}
      {model ? (
        <CancelDayDialog
          academyId={academyId}
          item={cancelItem}
          onClose={handleCloseCancel}
          teams={model.teamIndex}
        />
      ) : null}
    </>
  );
}
