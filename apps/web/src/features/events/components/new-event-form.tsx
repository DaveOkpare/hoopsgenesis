import { Button } from "@hoops-genesis/ui/components/button";
import { FilterChip } from "@hoops-genesis/ui/components/chip";
import { FieldMessage } from "@hoops-genesis/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hoops-genesis/ui/components/select";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { type AnyFieldApi, useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import {
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  useCallback,
  useId,
} from "react";
import { toast } from "sonner";
import z from "zod";

import {
  Chevron,
  PickerValue,
  rowClass,
  rowLabelClass,
  rowValueClass,
} from "@/features/events/components/picker-row";
import {
  type EventType,
  eventErrorMessage,
  eventLocationsQueryOptions,
  useCreateEvents,
} from "@/features/events/queries";
import { addDays, formatWeekdayDayMonth } from "@/features/sessions/time";
import type { DateOnly, Id, Team } from "@/features/types";
import { formatDayMonth } from "@/lib/format";

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "training", label: "Training" },
  { value: "match", label: "Match" },
  { value: "camp", label: "Camp" },
  { value: "other", label: "Other" },
];

const DAYS_PER_WEEK = 7;
const MAX_WEEKS = 26;
const TITLE_MAX = 80;

const schema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Give the event a name")
      .max(TITLE_MAX, "Keep the name under 80 characters"),
    eventType: z.enum(["training", "match", "camp", "other"]),
    teamId: z.string().min(1, "Pick a team"),
    date: z.string().min(1, "Pick a date"),
    endDate: z.string(),
    startTime: z.string().min(1, "Pick a start time"),
    endTime: z.string().min(1, "Pick an end time"),
    location: z.string().trim().min(1, "Pick a place"),
    collectAttendance: z.boolean(),
    repeatUntil: z.string(),
  })
  .refine((v) => v.endTime > v.startTime, {
    path: ["endTime"],
    message: "Ends before it starts",
  })
  .refine((v) => !v.repeatUntil || v.repeatUntil >= v.date, {
    path: ["repeatUntil"],
    message: "Pick a day after the first session",
  })
  .refine((v) => !v.endDate || v.endDate >= v.date, {
    path: ["endDate"],
    message: "The last day is before the first",
  });

type FormValues = z.input<typeof schema>;

/** One date per week from `date` until `until` (inclusive); just `date` when not repeating. */
export function weeklyDates(date: DateOnly, until: DateOnly | ""): DateOnly[] {
  if (!(date && until) || until < date) {
    return date ? [date] : [];
  }
  const dates: DateOnly[] = [];
  let current = date;
  while (current <= until && dates.length < MAX_WEEKS) {
    dates.push(current);
    current = addDays(current, DAYS_PER_WEEK);
  }
  return dates;
}

function firstError(field: AnyFieldApi): string | undefined {
  const error = field.state.meta.errors[0] as { message?: string } | undefined;
  return field.state.meta.isTouched || field.form.state.submissionAttempts > 0
    ? error?.message
    : undefined;
}

function TitleField({ field }: { field: AnyFieldApi }) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      field.handleChange(event.target.value),
    [field]
  );
  const error = firstError(field);
  return (
    <>
      <label className="sr-only" htmlFor={field.name}>
        Event name
      </label>
      <input
        aria-describedby={error ? `${field.name}-error` : undefined}
        aria-invalid={error ? true : undefined}
        className={cn(
          "w-full rounded-[14px] border-2 bg-white px-4 py-[14px] font-medium text-[17px] text-ink leading-[22px] outline-none transition-colors placeholder:font-regular placeholder:text-muted focus:border-ink",
          field.state.value ? "border-ink" : "border-line",
          error && "border-orange-deep"
        )}
        id={field.name}
        maxLength={TITLE_MAX}
        name={field.name}
        onBlur={field.handleBlur}
        onChange={handleChange}
        placeholder="e.g. U14 Training"
        value={field.state.value as string}
      />
      {error ? (
        <FieldMessage id={`${field.name}-error`} tone="error">
          {error}
        </FieldMessage>
      ) : null}
    </>
  );
}

function TypeField({
  field,
  onTypeChange,
}: {
  field: AnyFieldApi;
  onTypeChange: (type: EventType) => void;
}) {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const type = event.currentTarget.dataset.type as EventType;
      field.handleChange(type);
      onTypeChange(type);
    },
    [field, onTypeChange]
  );
  return (
    <fieldset className="flex flex-wrap gap-[6px]">
      <legend className="sr-only">Event type</legend>
      {EVENT_TYPES.map((type) => (
        <FilterChip
          className="px-[14px]"
          data-type={type.value}
          key={type.value}
          onClick={handleClick}
          selected={field.state.value === type.value}
        >
          {type.label}
        </FilterChip>
      ))}
    </fieldset>
  );
}

function SelectRow({
  field,
  label,
  items,
}: {
  field: AnyFieldApi;
  label: string;
  items: { value: string; label: string }[];
}) {
  const handleValue = useCallback(
    (value: string | null) => {
      if (value) {
        field.handleChange(value);
      }
    },
    [field]
  );
  const error = firstError(field);
  return (
    <div className={rowClass}>
      <span className={rowLabelClass} id={`${field.name}-label`}>
        {label}
      </span>
      <Select
        items={items}
        onValueChange={handleValue}
        value={field.state.value}
      >
        <SelectTrigger
          aria-invalid={error ? true : undefined}
          aria-labelledby={`${field.name}-label`}
          className="h-auto w-fit gap-1 rounded-[6px] border-0 bg-transparent p-0 font-medium text-[15px] leading-[18px] focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 data-popup-open:bg-transparent [&>svg]:hidden"
        >
          <SelectValue placeholder="Choose" />
          <Chevron />
        </SelectTrigger>
        <SelectContent align="end">
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DateRow({
  field,
  label,
  min,
}: {
  field: AnyFieldApi;
  label: string;
  min?: string;
}) {
  const id = useId();
  const value = field.state.value as string;
  const error = firstError(field);
  return (
    <div className="flex flex-col border-line border-b last:border-b-0">
      <div className={cn(rowClass, "border-b-0")}>
        <label className={rowLabelClass} htmlFor={id}>
          {label}
        </label>
        <PickerValue
          display={
            <span className={rowValueClass}>
              {value ? formatWeekdayDayMonth(value) : "Choose"} <Chevron />
            </span>
          }
          id={id}
          invalid={Boolean(error)}
          label={label}
          min={min}
          onValue={field.handleChange}
          type="date"
          value={value}
        />
      </div>
      {error ? (
        <FieldMessage className="-mt-2 pb-3 text-right" tone="error">
          {error}
        </FieldMessage>
      ) : null}
    </div>
  );
}

function TimeRow({ start, end }: { start: AnyFieldApi; end: AnyFieldApi }) {
  const startId = useId();
  const endId = useId();
  const error = firstError(end) ?? firstError(start);
  return (
    <div className="flex flex-col border-line border-b">
      <div className={cn(rowClass, "border-b-0")}>
        <span className={rowLabelClass}>Time</span>
        <span className={rowValueClass}>
          <PickerValue
            display={start.state.value as string}
            id={startId}
            label="Start time"
            onValue={start.handleChange}
            type="time"
            value={start.state.value as string}
          />
          <span aria-hidden="true">–</span>
          <PickerValue
            display={end.state.value as string}
            id={endId}
            invalid={Boolean(firstError(end))}
            label="End time"
            onValue={end.handleChange}
            type="time"
            value={end.state.value as string}
          />
          <Chevron />
        </span>
      </div>
      {error ? (
        <FieldMessage className="-mt-2 pb-3 text-right" tone="error">
          {error}
        </FieldMessage>
      ) : null}
    </div>
  );
}

function AttendanceRow({ field }: { field: AnyFieldApi }) {
  const checked = Boolean(field.state.value);
  const handleClick = useCallback(
    () => field.handleChange(!checked),
    [field, checked]
  );
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="flex flex-col">
        <span
          className="font-medium text-[15px] text-ink leading-[18px]"
          id="take-attendance-label"
        >
          Take attendance
        </span>
        <span
          className="text-[13px] text-muted leading-4"
          id="take-attendance-hint"
        >
          Students can check in with the QR code
        </span>
      </span>
      <button
        aria-checked={checked}
        aria-describedby="take-attendance-hint"
        aria-labelledby="take-attendance-label"
        className={cn(
          "flex h-[30px] w-[50px] shrink-0 cursor-pointer items-center rounded-full p-[3px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
          checked ? "justify-end bg-ink" : "justify-start bg-stone"
        )}
        onClick={handleClick}
        role="switch"
        type="button"
      >
        <span className="size-6 rounded-full bg-white shadow-[0_1px_2px_#11111126]" />
      </button>
    </div>
  );
}

function RepeatField({ field, date }: { field: AnyFieldApi; date: DateOnly }) {
  const id = useId();
  const until = field.state.value as string;
  const dates = weeklyDates(date, until);
  const error = firstError(field);
  const handleClear = useCallback(() => field.handleChange(""), [field]);
  return (
    <section className="flex flex-col gap-3 rounded-md border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <label
          className="font-medium text-[15px] text-ink leading-[18px]"
          htmlFor={id}
        >
          Repeat weekly until
        </label>
        <span className="flex items-center gap-1">
          <PickerValue
            display={
              <span className="flex rounded-full bg-fog px-3 py-[6px] font-semibold text-ink text-sm leading-[18px]">
                {until ? formatDayMonth(until) : "Off"}
              </span>
            }
            id={id}
            invalid={Boolean(error)}
            label="Repeat weekly until"
            min={date}
            onValue={field.handleChange}
            type="date"
            value={until}
          />
          {until ? (
            <Button
              aria-label="Stop repeating"
              className="text-muted"
              onClick={handleClear}
              size="icon-xs"
              variant="ghost"
            >
              <svg aria-hidden="true" viewBox="0 0 12 12">
                <path
                  d="M2 2l8 8M10 2L2 10"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.8"
                />
              </svg>
            </Button>
          ) : null}
        </span>
      </div>
      {error ? <FieldMessage tone="error">{error}</FieldMessage> : null}
      {until && !error ? (
        <ul
          aria-label="Sessions to create"
          className="flex flex-wrap gap-[6px]"
        >
          {dates.map((d) => (
            <li
              className="rounded-[10px] bg-fog px-[10px] py-[6px] font-medium text-[13px] text-ink leading-4"
              key={d}
            >
              {formatWeekdayDayMonth(d)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted leading-4">
          Pick a date to create one session per week.
        </p>
      )}
    </section>
  );
}

const selectSubmit = (state: { isSubmitting: boolean }) => state.isSubmitting;

/** New event (CO-2, 3QV-0). */
export function NewEventForm({
  academyId,
  teams,
  defaults,
  onCreated,
}: {
  academyId: Id;
  teams: Pick<Team, "id" | "name">[];
  defaults: { teamId?: Id; date: DateOnly; today: DateOnly };
  onCreated: (firstDate: DateOnly) => void;
}) {
  // Only suggestions for the place field ("Court 1" otherwise): a failure must not
  // replace a half-filled form with an error.
  const locations = useQuery({
    ...eventLocationsQueryOptions(academyId, defaults.today),
    throwOnError: false,
  });
  const create = useCreateEvents(academyId);
  const { mutateAsync } = create;

  const form = useForm({
    defaultValues: {
      title: "",
      eventType: "training",
      teamId: defaults.teamId ?? teams[0]?.id ?? "",
      date: defaults.date,
      endDate: "",
      startTime: "16:00",
      endTime: "17:30",
      location: "Court 1",
      collectAttendance: true,
      repeatUntil: "",
    } as FormValues,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      const parsed = schema.parse(value);
      const dates = weeklyDates(parsed.date, parsed.repeatUntil);
      try {
        await mutateAsync({
          dates,
          event: {
            title: parsed.title,
            eventType: parsed.eventType,
            teamId: parsed.teamId,
            startDate: parsed.date,
            endDate: parsed.endDate || undefined,
            startTime: parsed.startTime,
            endTime: parsed.endTime,
            location: parsed.location,
            collectAttendance: parsed.collectAttendance,
          },
        });
        toast.success(
          dates.length > 1
            ? `${dates.length} sessions created`
            : "Event created"
        );
        onCreated(parsed.date);
      } catch (error) {
        toast.error(eventErrorMessage(error));
      }
    },
  });

  const date = useStore(form.store, (s) => s.values.date);
  const eventType = useStore(form.store, (s) => s.values.eventType);
  const repeatUntil = useStore(form.store, (s) => s.values.repeatUntil);
  const count = weeklyDates(date, repeatUntil).length;

  const handleTypeChange = useCallback(
    (type: EventType) => {
      // "Take attendance" is on by default for training only.
      form.setFieldValue("collectAttendance", type === "training");
    },
    [form]
  );
  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      event.stopPropagation();
      form.handleSubmit();
    },
    [form]
  );

  const teamItems = teams.map((t) => ({ value: t.id, label: t.name }));
  const locationItems = (locations.data ?? ["Court 1"]).map((l) => ({
    value: l,
    label: l,
  }));

  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <form.Field name="title">
          {(field) => <TitleField field={field} />}
        </form.Field>
        <form.Field name="eventType">
          {(field) => (
            <TypeField field={field} onTypeChange={handleTypeChange} />
          )}
        </form.Field>
      </div>

      <div className="flex flex-col rounded-md bg-fog px-4">
        <form.Field name="teamId">
          {(field) => (
            <SelectRow field={field} items={teamItems} label="Team" />
          )}
        </form.Field>
        <form.Field name="date">
          {(field) => (
            <DateRow
              field={field}
              label={eventType === "camp" ? "First day" : "Date"}
            />
          )}
        </form.Field>
        {eventType === "camp" ? (
          <form.Field name="endDate">
            {(field) => <DateRow field={field} label="Last day" min={date} />}
          </form.Field>
        ) : null}
        <form.Field name="startTime">
          {(start) => (
            <form.Field name="endTime">
              {(end) => <TimeRow end={end} start={start} />}
            </form.Field>
          )}
        </form.Field>
        <form.Field name="location">
          {(field) => (
            <SelectRow field={field} items={locationItems} label="Location" />
          )}
        </form.Field>
        <form.Field name="collectAttendance">
          {(field) => <AttendanceRow field={field} />}
        </form.Field>
      </div>

      <form.Field name="repeatUntil">
        {(field) => <RepeatField date={date} field={field} />}
      </form.Field>

      <form.Subscribe selector={selectSubmit}>
        {(isSubmitting) => (
          <Button
            className="w-full p-4 text-base leading-5"
            disabled={isSubmitting}
            type="submit"
          >
            {count > 1 ? `Create ${count} sessions` : "Create event"}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
