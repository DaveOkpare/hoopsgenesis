import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
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
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { type AnyFieldApi, useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import {
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useId,
  useState,
} from "react";
import { toast } from "sonner";
import z from "zod";
import { ErrorState } from "@/components/error-state";
import { useIsOffline } from "@/components/offline";
import { PickerValue } from "@/features/events/components/picker-row";
import {
  bestNote,
  RecentResults,
} from "@/features/results/components/recent-results";
import { StudentPicker } from "@/features/results/components/student-picker";
import {
  type CoachStudent,
  coachStudentsQueryOptions,
  recentResultsQueryOptions,
  resultErrorMessage,
  resultTemplatesQueryOptions,
  sessionOptionsQueryOptions,
  useCreateAthleticRecord,
} from "@/features/results/queries";
import {
  type DrillId,
  type ExtraField,
  extraDefaults,
  type ResultTemplate,
} from "@/features/results/templates";
import { formatWeekdayDayMonth } from "@/features/sessions/time";
import type { DateOnly, Id, Team } from "@/features/types";
import { firstName, initials } from "@/lib/format";

const NO_SESSION = "none";
const DEFAULT_ATTEMPTS = 10;

function scoreSchema(template: ResultTemplate) {
  if (template.metric === "measure") {
    const unit = template.unit ? ` ${template.unit}` : "";
    const base = z
      .number({ message: `Enter the ${template.scoreLabel.toLowerCase()}` })
      .min(template.min, `At least ${template.min}${unit}`)
      .max(template.max, `At most ${template.max}${unit}`);
    return template.integer ? base.int("Whole numbers only") : base;
  }
  const attempts = template.attempts ?? DEFAULT_ATTEMPTS;
  return z
    .number({ message: `Enter how many went in, 0 to ${attempts}` })
    .int("Whole numbers only")
    .min(0, `Enter how many went in, 0 to ${attempts}`)
    .max(attempts, `Can't be more than ${attempts}`);
}

function ScoreBox({
  field,
  template,
  note,
}: {
  field: AnyFieldApi;
  template: ResultTemplate;
  note: { text: string; tone: "success" | "muted" } | null;
}) {
  const id = useId();
  const value = field.state.value as number | null;
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      field.handleChange(raw === "" ? null : Number(raw));
    },
    [field]
  );
  const error = (field.state.meta.errors[0] as { message?: string } | undefined)
    ?.message;
  const label = template.scoreLabel;
  const digits = Math.max(1, String(value ?? "").length);
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-[20px] border-2 px-4 py-[22px] transition-colors focus-within:border-ink",
        error ? "border-orange-deep" : "border-ink"
      )}
    >
      <label
        className="font-semibold text-[13px] text-muted uppercase leading-4 tracking-label"
        htmlFor={id}
      >
        {label}
      </label>
      <span className="flex items-baseline gap-[6px]">
        <input
          aria-describedby={`${id}-hint`}
          aria-invalid={error ? true : undefined}
          className="bg-transparent text-center font-display text-[72px] text-ink leading-none outline-none [appearance:textfield] placeholder:text-stone [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          id={id}
          inputMode={template.integer ? "numeric" : "decimal"}
          max={template.metric === "measure" ? template.max : template.attempts}
          min={template.metric === "measure" ? template.min : 0}
          onBlur={field.handleBlur}
          onChange={handleChange}
          placeholder="0"
          step={template.integer ? 1 : "any"}
          style={{ width: `${digits * 0.62}em` }}
          type="number"
          value={value ?? ""}
        />
        <span
          className="font-semibold text-[20px] text-muted leading-6"
          id={`${id}-hint`}
        >
          {template.metric === "measure"
            ? (template.unit ?? "")
            : `of ${template.attempts}`}
        </span>
      </span>
      {error ? (
        <FieldMessage className="text-sm leading-[18px]" tone="error">
          {error}
        </FieldMessage>
      ) : null}
      {!error && note ? (
        <p
          className={cn(
            "font-semibold text-sm leading-[18px]",
            note.tone === "success" ? "text-success" : "text-muted"
          )}
        >
          {note.text}
        </p>
      ) : null}
    </div>
  );
}

function StudentCard({
  student,
  onChange,
}: {
  student: CoachStudent | undefined;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-fog px-[14px] py-3">
      <Avatar size={44} tone="white">
        <AvatarFallback className="text-sm">
          {student ? initials(student.name) : "?"}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate font-semibold text-base text-ink leading-5">
          {student ? student.name : "Choose a student"}
        </p>
        <p className="text-[13px] text-muted leading-4">
          {student
            ? [student.teamName, student.sport].filter(Boolean).join(" · ")
            : "From your teams"}
        </p>
      </div>
      <Button onClick={onChange} variant="link">
        {student ? "Change" : "Choose"}
      </Button>
    </div>
  );
}

const selectSubmit = (state: { isSubmitting: boolean }) => state.isSubmitting;

/** Log a result (CO-8, 3P1-0). The fields come from the chosen template. */
export function LogResultForm({
  academyId,
  teams,
  today,
  studentId,
  drill,
  onStudentChange,
  onDrillChange,
  onSaved,
}: {
  academyId: Id;
  teams: Pick<Team, "id" | "name">[];
  today: DateOnly;
  studentId?: Id;
  drill?: DrillId;
  onStudentChange: (studentId: Id) => void;
  onDrillChange: (drill: DrillId) => void;
  onSaved: () => void;
}) {
  const students = useQuery(coachStudentsQueryOptions(academyId, teams));
  const student = students.data?.find((s) => s.id === studentId);
  // The chips follow the student's team: in real mode every team gets the server's
  // templates; the preview draws football drills for Girls U16 (IEF-0).
  const templates = useQuery({
    ...resultTemplatesQueryOptions(academyId, student?.teamId ?? null),
    // Wait for the picked student's team before choosing the chips.
    enabled: !studentId || students.data !== undefined,
  });
  const template =
    templates.data?.find((t) => t.id === drill) ?? templates.data?.[0];
  if (!template) {
    return templates.data ? (
      <p className="text-[15px] text-muted leading-5">
        No athletic templates are set up for this academy yet.
      </p>
    ) : (
      <Skeleton className="h-[420px] w-full max-w-[560px] rounded-md" />
    );
  }
  return (
    <LogResultFields
      academyId={academyId}
      onDrillChange={onDrillChange}
      onSaved={onSaved}
      onStudentChange={onStudentChange}
      student={student}
      students={students.data}
      template={template}
      templates={templates.data ?? []}
      today={today}
    />
  );
}

function LogResultFields({
  academyId,
  today,
  student,
  students,
  template,
  templates,
  onStudentChange,
  onDrillChange,
  onSaved,
}: {
  academyId: Id;
  today: DateOnly;
  student: CoachStudent | undefined;
  /** undefined while loading. */
  students: CoachStudent[] | undefined;
  template: ResultTemplate;
  templates: ResultTemplate[];
  onStudentChange: (studentId: Id) => void;
  onDrillChange: (drill: DrillId) => void;
  onSaved: () => void;
}) {
  const studentId = student?.id;
  const [pickerOpen, setPickerOpen] = useState(false);
  // Saving needs the server: the button waits while the phone is offline.
  const offline = useIsOffline();
  const create = useCreateAthleticRecord(academyId);
  const { mutateAsync } = create;

  // The chart and the session picker are helpers around the form: when they fail they
  // say so in place, and what the coach typed stays.
  const recent = useQuery({
    ...recentResultsQueryOptions(academyId, studentId ?? "", template),
    enabled: Boolean(studentId),
    throwOnError: false,
  });

  const form = useForm({
    defaultValues: {
      score: null as number | null,
      date: today,
      /** null until the coach picks one: then the day's first session is used. */
      session: null as string | null,
      /** The template's other fields (raw text; see templates.ts). */
      extras: extraDefaults(template),
    },
    onSubmit: async ({ value }) => {
      if (!student || value.score === null) {
        return;
      }
      const session = effectiveSession(value.session);
      try {
        await mutateAsync({
          studentId: student.id,
          recordedOn: value.date,
          template,
          score: value.score,
          extras: value.extras,
          eventId: session === NO_SESSION ? undefined : session,
        });
        toast.success(`Result saved for ${student.name}`);
        onSaved();
      } catch (error) {
        toast.error(resultErrorMessage(error));
      }
    },
  });

  const score = useStore(form.store, (s) => s.values.score);
  const date = useStore(form.store, (s) => s.values.date);
  const sessions = useQuery({
    ...sessionOptionsQueryOptions(
      academyId,
      { id: student?.teamId ?? "", name: student?.teamName ?? "" },
      date
    ),
    enabled: Boolean(student),
    throwOnError: false,
  });
  const retrySessions = useCallback(() => sessions.refetch(), [sessions]);
  const sessionItems = [
    ...(sessions.data ?? []).map((s) => ({ value: s.eventId, label: s.label })),
    { value: NO_SESSION, label: "No session" },
  ];
  // Derived default: the coach's pick while it is still offered, else that day's first
  // session, else none.
  const effectiveSession = (picked: string | null): string =>
    picked && sessionItems.some((item) => item.value === picked)
      ? picked
      : (sessions.data?.[0]?.eventId ?? NO_SESSION);

  const note = bestNote(
    recent.data ?? [],
    template,
    score,
    student?.pronoun ?? "they"
  );

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const handlePick = useCallback(
    (id: Id) => {
      setPickerOpen(false);
      onStudentChange(id);
    },
    [onStudentChange]
  );
  const handleDrill = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const next = event.currentTarget.dataset.drill as DrillId;
      const nextTemplate = templates.find((t) => t.id === next);
      form.reset({
        ...form.state.values,
        score: null,
        extras: nextTemplate ? extraDefaults(nextTemplate) : {},
      });
      onDrillChange(next);
    },
    [form, onDrillChange, templates]
  );
  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!student) {
        setPickerOpen(true);
        return;
      }
      form.handleSubmit();
    },
    [form, student]
  );

  let chart: ReactNode = null;
  if (student && recent.data) {
    chart = (
      <RecentResults
        current={score}
        firstName={firstName(student.name)}
        results={recent.data}
        template={template}
      />
    );
  } else if (student && recent.isError) {
    chart = (
      <ErrorState
        error={recent.error}
        onRetry={recent.refetch}
        what="recent results"
      />
    );
  }

  return (
    <div className="flex items-start gap-8 max-md:flex-col max-md:items-stretch max-md:gap-5">
      <form
        className="flex w-full max-w-[560px] flex-col gap-5"
        noValidate
        onSubmit={handleSubmit}
      >
        {students ? (
          <StudentCard onChange={openPicker} student={student} />
        ) : (
          <Skeleton className="h-[68px] rounded-md" />
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 font-semibold text-[13px] text-muted uppercase leading-4 tracking-label">
            Template
          </legend>
          <div className="flex flex-wrap gap-[6px]">
            {templates.map((t) => (
              <FilterChip
                className="px-[14px]"
                data-drill={t.id}
                key={t.id}
                onClick={handleDrill}
                selected={t.id === template.id}
              >
                {t.label}
              </FilterChip>
            ))}
          </div>
        </fieldset>

        <form.Field
          name="score"
          validators={{ onSubmit: scoreSchema(template) }}
        >
          {(field) => (
            <ScoreBox field={field} note={note} template={template} />
          )}
        </form.Field>

        <div className="flex gap-2">
          <form.Field name="date">
            {(field) => <DateField field={field} today={today} />}
          </form.Field>
          <form.Field name="session">
            {(field) => (
              <SessionField
                field={field}
                items={sessionItems}
                value={effectiveSession(field.state.value as string | null)}
              />
            )}
          </form.Field>
        </div>
        {sessions.isError && !sessions.data ? (
          <FieldMessage className="text-sm leading-[18px]" tone="error">
            Couldn’t load that day’s sessions, so “No session” is used.{" "}
            <button
              className="cursor-pointer font-semibold text-ink underline underline-offset-2"
              onClick={retrySessions}
              type="button"
            >
              Try again
            </button>
          </FieldMessage>
        ) : null}

        {template.extras.map((extra) => (
          <form.Field
            key={`${template.id}-${extra.name}`}
            name={`extras.${extra.name}`}
            validators={{ onSubmit: extraSchema(extra) }}
          >
            {(field) => <ExtraInput extra={extra} field={field} />}
          </form.Field>
        ))}

        <div className="md:hidden">{chart}</div>

        <form.Subscribe selector={selectSubmit}>
          {(isSubmitting) => (
            <Button
              className="w-full p-4 text-base leading-5"
              disabled={isSubmitting || offline}
              type="submit"
            >
              Save result
            </Button>
          )}
        </form.Subscribe>
      </form>

      <aside className="w-[340px] shrink-0 max-md:hidden">{chart}</aside>

      <StudentPicker
        onOpenChange={setPickerOpen}
        onPick={handlePick}
        open={pickerOpen}
        selectedId={studentId}
        students={students ?? []}
      />
    </div>
  );
}

function DateField({ field, today }: { field: AnyFieldApi; today: DateOnly }) {
  const id = useId();
  const value = field.state.value as string;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
      <label
        className="font-semibold text-ink text-sm leading-[18px]"
        htmlFor={id}
      >
        Date
      </label>
      <PickerValue
        className="w-full rounded-[14px]"
        display={
          <span className="flex w-full rounded-[14px] bg-fog px-[14px] py-[13px] text-[15px] text-ink leading-[18px]">
            {value === today ? "Today" : formatWeekdayDayMonth(value)}
          </span>
        }
        id={id}
        label="Date"
        onValue={field.handleChange}
        type="date"
        value={value}
      />
    </div>
  );
}

function SessionField({
  field,
  items,
  value,
}: {
  field: AnyFieldApi;
  items: { value: string; label: string }[];
  value: string;
}) {
  const handleValue = useCallback(
    (next: string | null) => {
      if (next) {
        field.handleChange(next);
      }
    },
    [field]
  );
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
      <span
        className="font-semibold text-ink text-sm leading-[18px]"
        id="result-session-label"
      >
        Session
      </span>
      <Select items={items} onValueChange={handleValue} value={value}>
        <SelectTrigger
          aria-labelledby="result-session-label"
          className="py-[11px] [&>svg]:hidden"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
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

const optionLabel = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");

function numberIssue(extra: ExtraField, value: string): string | null {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return "Enter a number";
  }
  if (extra.integer && !Number.isInteger(number)) {
    return "Whole numbers only";
  }
  if (extra.min !== null && number < extra.min) {
    return `At least ${extra.min}`;
  }
  if (extra.max !== null && number > extra.max) {
    return `At most ${extra.max}`;
  }
  return null;
}

/** Validation for one of the template's other fields (raw text from the input). */
function extraSchema(extra: ExtraField) {
  const name = extra.label.toLowerCase();
  return z.string().superRefine((raw, ctx) => {
    const value = raw.trim();
    let message: string | null = null;
    if (value === "") {
      if (extra.required) {
        message =
          extra.kind === "choice" ? `Choose the ${name}` : `Enter the ${name}`;
      }
    } else if (extra.kind === "number") {
      message = numberIssue(extra, value);
    } else if (
      extra.kind === "text" &&
      extra.maxLength !== null &&
      value.length > extra.maxLength
    ) {
      message = `At most ${extra.maxLength} characters`;
    }
    if (message) {
      ctx.addIssue({ code: "custom", message });
    }
  });
}

function ExtraLabel({
  extra,
  htmlFor,
}: {
  extra: ExtraField;
  htmlFor?: string;
}) {
  const optional = extra.required ? null : (
    <span className="font-normal text-muted"> (optional)</span>
  );
  const className = "font-semibold text-ink text-sm leading-[18px]";
  return htmlFor ? (
    <label className={className} htmlFor={htmlFor}>
      {extra.label}
      {optional}
    </label>
  ) : (
    <span className={className}>
      {extra.label}
      {optional}
    </span>
  );
}

/**
 * A template field besides the score, in the form's visual language: a choice is a
 * row of chips (like Template), a number or text a fog box (like Date).
 */
function ExtraInput({
  extra,
  field,
}: {
  extra: ExtraField;
  field: AnyFieldApi;
}) {
  const id = useId();
  const value = (field.state.value as string | undefined) ?? "";
  const error = (field.state.meta.errors[0] as { message?: string } | undefined)
    ?.message;
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      field.handleChange(event.target.value),
    [field]
  );
  const handleChoice = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const next = event.currentTarget.dataset.value ?? "";
      // An optional choice can be cleared by tapping it again.
      field.handleChange(!extra.required && next === value ? "" : next);
    },
    [extra.required, field, value]
  );
  const describedBy = extra.description ? `${id}-hint` : undefined;
  const hint = extra.description ? (
    <p className="text-[13px] text-muted leading-4" id={`${id}-hint`}>
      {extra.description}
    </p>
  ) : null;
  const message = error ? (
    <FieldMessage className="text-sm leading-[18px]" tone="error">
      {error}
    </FieldMessage>
  ) : null;
  if (extra.kind === "choice") {
    return (
      <fieldset
        aria-describedby={describedBy}
        className="flex flex-col gap-[6px]"
      >
        <legend className="pb-[6px]">
          <ExtraLabel extra={extra} />
        </legend>
        <div className="flex flex-wrap gap-[6px]">
          {extra.options.map((option) => (
            <FilterChip
              className="px-[14px]"
              data-value={option}
              key={option}
              onClick={handleChoice}
              selected={option === value}
            >
              {optionLabel(option)}
            </FilterChip>
          ))}
        </div>
        {hint}
        {message}
      </fieldset>
    );
  }
  return (
    <div className="flex flex-col gap-[6px]">
      <ExtraLabel extra={extra} htmlFor={id} />
      <input
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={cn(
          "w-full rounded-[14px] border-2 bg-fog px-[14px] py-[11px] text-[15px] text-ink leading-[18px] outline-none transition-colors placeholder:text-muted focus:border-ink",
          error ? "border-orange-deep" : "border-transparent"
        )}
        id={id}
        inputMode={extra.kind === "number" ? "decimal" : undefined}
        maxLength={extra.maxLength ?? undefined}
        onBlur={field.handleBlur}
        onChange={handleChange}
        type="text"
        value={value}
      />
      {hint}
      {message}
    </div>
  );
}
