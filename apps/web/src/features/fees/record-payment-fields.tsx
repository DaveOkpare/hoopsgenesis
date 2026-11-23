/*
 * Fields of the Record payment form (2OD-0 web, 5U0-0 phone). Each takes a TanStack
 * Form field so handlers stay stable; the dialog decides which layout to render.
 */
import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import {
  Field,
  FieldMessage,
  Label,
  LabelHint,
} from "@hoops-genesis/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hoops-genesis/ui/components/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@hoops-genesis/ui/components/toggle-group";
import { cn } from "@hoops-genesis/ui/lib/utils";
import type { AnyFieldApi } from "@tanstack/react-form";
import {
  type ChangeEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useMemo,
} from "react";

import {
  isPaymentMethod,
  methodLabel,
  methodShortLabel,
  type PeriodKey,
  periodLongLabel,
  periodRangeLabel,
} from "@/features/fees/periods";
import type { FeeStudent } from "@/features/fees/queries";
import type { PaymentMethod } from "@/features/types";
import {
  formatAmount,
  formatDayMonth,
  formatMonthYear,
  formatRelativeDay,
  initials,
} from "@/lib/format";

const NON_DIGITS = /\D/g;

const DESKTOP_METHODS: PaymentMethod[] = [
  "cash",
  "bank_transfer",
  "mobile_money",
];
const PHONE_METHODS: PaymentMethod[] = [
  "cash",
  "mobile_money",
  "bank_transfer",
];

function firstError(field: AnyFieldApi): string | undefined {
  const error = field.state.meta.errors[0] as
    | { message?: string }
    | string
    | undefined;
  return typeof error === "string" ? error : error?.message;
}

function ErrorMessage({ field }: { field: AnyFieldApi }) {
  const message = firstError(field);
  return message ? (
    <FieldMessage id={`${field.name}-error`} tone="error">
      {message}
    </FieldMessage>
  ) : null;
}

/** "U14 · last paid October" */
function studentSubtitle(student: FeeStudent, timeZone: string): string {
  const team = student.teamName ?? "No team";
  if (!student.lastPaidAt) {
    return `${team} · no payments yet`;
  }
  const [month] = formatMonthYear(student.lastPaidAt, timeZone).split(" ");
  return `${team} · last paid ${month}`;
}

/* ---------- Student ---------- */

function useStudentHandler(field: AnyFieldApi) {
  return useCallback(
    (value: unknown) => {
      if (typeof value === "string") {
        field.handleChange(value);
      }
    },
    [field]
  );
}

function StudentOptions({ students }: { students: FeeStudent[] }) {
  return (
    <SelectContent className="max-h-80">
      {students.map((student) => (
        <SelectItem key={student.id} value={student.id}>
          {student.name}
          <span className="text-muted">
            {student.teamName ? `· ${student.teamName}` : "· No team"}
          </span>
        </SelectItem>
      ))}
    </SelectContent>
  );
}

export function StudentSelectField({
  field,
  students,
}: {
  field: AnyFieldApi;
  students: FeeStudent[];
}) {
  const handleChange = useStudentHandler(field);
  const value = field.state.value as string;
  const selected = students.find((s) => s.id === value);
  const items = useMemo(
    () => students.map((s) => ({ value: s.id, label: s.name })),
    [students]
  );
  const error = firstError(field);
  return (
    <Field>
      <Label htmlFor="record-student">Student</Label>
      <Select items={items} onValueChange={handleChange} value={value || null}>
        <SelectTrigger
          aria-describedby={error ? `${field.name}-error` : undefined}
          aria-invalid={error ? true : undefined}
          className={cn(selected && "py-[10px]")}
          id="record-student"
        >
          <SelectValue placeholder="Choose a student">
            {selected ? (
              <span className="flex min-w-0 items-center gap-[10px]">
                <Avatar size={28} tone="white">
                  <AvatarFallback>{initials(selected.name)}</AvatarFallback>
                </Avatar>
                <span className="truncate">
                  {selected.name}{" "}
                  <span className="text-muted">
                    · {selected.teamName ?? "No team"}
                  </span>
                </span>
              </span>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <StudentOptions students={students} />
      </Select>
      <ErrorMessage field={field} />
    </Field>
  );
}

export function StudentCardField({
  field,
  students,
  timeZone,
}: {
  field: AnyFieldApi;
  students: FeeStudent[];
  timeZone: string;
}) {
  const handleChange = useStudentHandler(field);
  const value = field.state.value as string;
  const selected = students.find((s) => s.id === value);
  const items = useMemo(
    () => students.map((s) => ({ value: s.id, label: s.name })),
    [students]
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 rounded-[18px] bg-fog px-[14px] py-3">
        <Avatar className="size-10 text-[13px]" size={44} tone="white">
          <AvatarFallback>
            {selected ? initials(selected.name) : "?"}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <p className="truncate font-semibold text-base text-ink leading-5">
            {selected ? selected.name : "No student chosen"}
          </p>
          <p className="text-[13px] text-muted leading-4">
            {selected
              ? studentSubtitle(selected, timeZone)
              : "Pick who this payment is for"}
          </p>
        </div>
        <Select
          items={items}
          onValueChange={handleChange}
          value={value || null}
        >
          <SelectTrigger
            aria-label={
              selected ? `Change student, ${selected.name}` : "Choose a student"
            }
            className="w-fit gap-0 rounded-none border-0 bg-transparent p-0 font-semibold text-ink text-sm leading-[18px] underline decoration-1 underline-offset-[3px] focus-visible:bg-transparent data-popup-open:bg-transparent [&>svg]:hidden"
          >
            {selected ? "Change" : "Choose"}
          </SelectTrigger>
          <StudentOptions students={students} />
        </Select>
      </div>
      <ErrorMessage field={field} />
    </div>
  );
}

/* ---------- Period ---------- */

function usePeriodItems(periods: PeriodKey[], phone: boolean) {
  return useMemo(
    () =>
      periods.map((key) => ({
        value: key,
        label: phone ? periodRangeLabel(key) : periodLongLabel(key),
      })),
    [periods, phone]
  );
}

export function PeriodField({
  field,
  periods,
  variant,
}: {
  field: AnyFieldApi;
  periods: PeriodKey[];
  variant: "field" | "row";
}) {
  const items = usePeriodItems(periods, variant === "row");
  const handleChange = useCallback(
    (value: unknown) => {
      if (typeof value === "string") {
        field.handleChange(value);
      }
    },
    [field]
  );
  const content = (
    <SelectContent>
      {items.map((item) => (
        <SelectItem key={item.value} value={item.value}>
          {item.label}
        </SelectItem>
      ))}
    </SelectContent>
  );
  if (variant === "row") {
    return (
      <Select
        items={items}
        onValueChange={handleChange}
        value={field.state.value as string}
      >
        <SelectTrigger
          aria-label="Period"
          className="rounded-none border-0 border-line border-b bg-transparent px-0 py-[13px] text-[15px] leading-5 focus-visible:border-line focus-visible:bg-transparent data-popup-open:border-line data-popup-open:bg-transparent [&>svg]:hidden"
        >
          <span className="text-muted">Period</span>
          <SelectValue className="justify-end font-semibold" />
        </SelectTrigger>
        {content}
      </Select>
    );
  }
  return (
    <Field className="flex-1 basis-0">
      <Label htmlFor="record-period">Period</Label>
      <Select
        items={items}
        onValueChange={handleChange}
        value={field.state.value as string}
      >
        <SelectTrigger className="px-4" id="record-period">
          <SelectValue />
        </SelectTrigger>
        {content}
      </Select>
    </Field>
  );
}

/* ---------- Amount ---------- */

function useAmountHandler(field: AnyFieldApi) {
  return useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      field.handleChange(event.target.value.replace(NON_DIGITS, "")),
    [field]
  );
}

function displayAmount(digits: string): string {
  return digits ? formatAmount(digits) : "";
}

export function AmountField({
  field,
  currency,
}: {
  field: AnyFieldApi;
  currency: string;
}) {
  const handleChange = useAmountHandler(field);
  const error = firstError(field);
  return (
    <Field className="flex-1 basis-0">
      <Label htmlFor="record-amount">Amount</Label>
      <div className="flex items-center gap-2 rounded-[14px] border-2 border-transparent bg-fog px-[14px] py-3 focus-within:border-ink focus-within:bg-white has-aria-invalid:border-orange-deep">
        <span className="font-semibold text-[15px] text-muted leading-[18px]">
          {currency}
        </span>
        <input
          aria-describedby={error ? `${field.name}-error` : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink leading-[18px] outline-none placeholder:text-muted"
          id="record-amount"
          inputMode="numeric"
          name={field.name}
          onBlur={field.handleBlur}
          onChange={handleChange}
          placeholder="0"
          value={displayAmount(field.state.value as string)}
        />
      </div>
      <ErrorMessage field={field} />
    </Field>
  );
}

export function BigAmountField({
  field,
  currency,
  period,
}: {
  field: AnyFieldApi;
  currency: string;
  period: PeriodKey;
}) {
  const handleChange = useAmountHandler(field);
  const [monthName = ""] = periodLongLabel(period).split(" ");
  return (
    <div className="flex flex-col items-center gap-1 py-[18px]">
      <label
        className="font-medium text-[13px] text-muted uppercase leading-4 tracking-label"
        htmlFor="record-amount-big"
      >
        {monthName} fee
      </label>
      <div className="flex items-baseline gap-2">
        <span className="font-medium text-[20px] text-muted leading-6">
          {currency}
        </span>
        <input
          autoComplete="off"
          className="field-sizing-content min-w-[2ch] max-w-[260px] bg-transparent text-center font-display text-[72px] text-ink leading-[72px] outline-none placeholder:text-stone focus-visible:underline focus-visible:decoration-2 focus-visible:underline-offset-8"
          id="record-amount-big"
          inputMode="numeric"
          name={field.name}
          onBlur={field.handleBlur}
          onChange={handleChange}
          placeholder="0"
          value={displayAmount(field.state.value as string)}
        />
      </div>
      <ErrorMessage field={field} />
    </div>
  );
}

/* ---------- Date paid ---------- */

function dateLabel(
  value: string,
  today: string,
  timeZone: string,
  now: Date,
  short: boolean
): string {
  if (!value) {
    return "Choose a date";
  }
  const dayMonth = formatDayMonth(value, timeZone);
  if (value === today) {
    return short ? "Today" : `Today, ${dayMonth}`;
  }
  const relative = formatRelativeDay(value, timeZone, now);
  if (short || relative === dayMonth) {
    return relative;
  }
  return `${relative}, ${dayMonth}`;
}

function openPicker(event: MouseEvent<HTMLInputElement>) {
  try {
    event.currentTarget.showPicker();
  } catch {
    // Older browsers: the native control still opens on its own.
  }
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      height="16"
      viewBox="0 0 18 18"
      width="16"
    >
      <rect
        fill="none"
        height="12.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
        width="14"
        x="2"
        y="3.5"
      />
      <path d="M2 7.5h14" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function DatePaidField({
  field,
  today,
  now,
  timeZone,
  variant,
}: {
  field: AnyFieldApi;
  today: string;
  now: Date;
  timeZone: string;
  variant: "field" | "row";
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      field.handleChange(event.target.value),
    [field]
  );
  const value = field.state.value as string;
  const error = firstError(field);
  const input = (
    <input
      aria-describedby={error ? `${field.name}-error` : undefined}
      aria-invalid={error ? true : undefined}
      className="absolute inset-0 size-full cursor-pointer opacity-0"
      id="record-paid-on"
      max={today}
      name={field.name}
      onBlur={field.handleBlur}
      onChange={handleChange}
      onClick={openPicker}
      type="date"
      value={value}
    />
  );
  if (variant === "row") {
    return (
      <div className="relative flex justify-between border-line border-b py-[13px] text-[15px] leading-5 focus-within:bg-fog">
        <label className="text-muted" htmlFor="record-paid-on">
          Date paid
        </label>
        <span aria-hidden="true" className="font-semibold text-ink">
          {dateLabel(value, today, timeZone, now, true)}
        </span>
        {input}
      </div>
    );
  }
  return (
    <Field className="flex-1 basis-0">
      <Label htmlFor="record-paid-on">Date paid</Label>
      <div className="relative flex items-center justify-between rounded-[14px] border-2 border-transparent bg-fog px-[14px] py-3 text-[15px] text-ink leading-[18px] focus-within:border-ink focus-within:bg-white">
        <span aria-hidden="true">
          {dateLabel(value, today, timeZone, now, false)}
        </span>
        <CalendarIcon />
        {input}
      </div>
      <ErrorMessage field={field} />
    </Field>
  );
}

/* ---------- Reference ---------- */

export function ReferenceField({
  field,
  variant,
}: {
  field: AnyFieldApi;
  variant: "field" | "row";
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      field.handleChange(event.target.value),
    [field]
  );
  if (variant === "row") {
    return (
      <div className="flex items-center justify-between gap-4 py-[13px] text-[15px] leading-5">
        <label className="shrink-0 text-muted" htmlFor="record-reference">
          Reference
        </label>
        <input
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-right font-semibold text-ink outline-none placeholder:font-regular placeholder:text-[#B5B5B5]"
          id="record-reference"
          name={field.name}
          onBlur={field.handleBlur}
          onChange={handleChange}
          placeholder="Optional"
          value={field.state.value as string}
        />
      </div>
    );
  }
  return (
    <Field className="flex-1 basis-0">
      <Label htmlFor="record-reference">
        Reference <LabelHint>(optional)</LabelHint>
      </Label>
      <input
        autoComplete="off"
        className="w-full min-w-0 rounded-[14px] border-2 border-transparent bg-fog px-[14px] py-3 text-[15px] text-ink leading-[18px] outline-none transition-colors placeholder:text-muted focus-visible:border-ink focus-visible:bg-white"
        id="record-reference"
        name={field.name}
        onBlur={field.handleBlur}
        onChange={handleChange}
        placeholder="Receipt or transfer no."
        value={field.state.value as string}
      />
    </Field>
  );
}

/* ---------- Method ---------- */

export function MethodField({
  field,
  variant,
}: {
  field: AnyFieldApi;
  variant: "field" | "row";
}) {
  const handleChange = useCallback(
    (values: unknown[]) => {
      const [next] = values;
      if (isPaymentMethod(next)) {
        field.handleChange(next);
      }
    },
    [field]
  );
  const isPhone = variant === "row";
  const methods = isPhone ? PHONE_METHODS : DESKTOP_METHODS;
  const label: ReactNode = isPhone ? "Paid by" : "Method";
  return (
    <Field>
      <Label id="record-method-label">{label}</Label>
      <ToggleGroup
        aria-labelledby="record-method-label"
        onValueChange={handleChange}
        value={[field.state.value as string]}
      >
        {methods.map((method) => (
          <ToggleGroupItem key={method} value={method}>
            {isPhone ? methodShortLabel(method) : methodLabel(method)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}
