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
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";
import { toast } from "sonner";
import z from "zod";

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
  sessionOptionsQueryOptions,
  useCreateAthleticRecord,
} from "@/features/results/queries";
import {
  type AthleticData,
  type DrillId,
  RESULT_TEMPLATES,
  type ResultTemplate,
  templateFor,
} from "@/features/results/templates";
import { formatWeekdayDayMonth } from "@/features/sessions/time";
import type { DateOnly, Id, Team } from "@/features/types";
import { firstName, initials } from "@/lib/format";

const NO_SESSION = "none";
const MAX_SECONDS = 600;

function scoreSchema(template: ResultTemplate) {
  if (template.metric === "seconds") {
    return z
      .number({ message: "Enter the time in seconds" })
      .int("Whole seconds only")
      .min(1, "Enter the time in seconds")
      .max(MAX_SECONDS, "That is more than 10 minutes");
  }
  const attempts = template.attempts ?? 10;
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
  const label = template.metric === "seconds" ? "Time" : "Made";
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
          inputMode="numeric"
          max={template.metric === "seconds" ? MAX_SECONDS : template.attempts}
          min={0}
          onBlur={field.handleBlur}
          onChange={handleChange}
          placeholder="0"
          style={{ width: `${digits * 0.62}em` }}
          type="number"
          value={value ?? ""}
        />
        <span
          className="font-semibold text-[20px] text-muted leading-6"
          id={`${id}-hint`}
        >
          {template.metric === "seconds"
            ? "seconds"
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
          {student ? student.teamName : "From your teams"}
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
  viewerId,
  today,
  studentId,
  drill,
  onStudentChange,
  onDrillChange,
  onSaved,
}: {
  academyId: Id;
  teams: Pick<Team, "id" | "name">[];
  viewerId: Id;
  today: DateOnly;
  studentId?: Id;
  drill: DrillId;
  onStudentChange: (studentId: Id) => void;
  onDrillChange: (drill: DrillId) => void;
  onSaved: () => void;
}) {
  const teamIds = teams.map((t) => t.id);
  const students = useQuery(coachStudentsQueryOptions(academyId, teamIds));
  const student = students.data?.find((s) => s.id === studentId);
  const template = templateFor(drill) ?? RESULT_TEMPLATES[0];
  const [pickerOpen, setPickerOpen] = useState(false);
  const create = useCreateAthleticRecord(academyId);
  const { mutateAsync } = create;

  const recent = useQuery({
    ...recentResultsQueryOptions(academyId, studentId ?? "", drill),
    enabled: Boolean(studentId),
  });

  const form = useForm({
    defaultValues: {
      score: null as number | null,
      date: today,
      session: NO_SESSION,
    },
    onSubmit: async ({ value }) => {
      if (!(student && template) || value.score === null) {
        return;
      }
      const data: AthleticData =
        template.metric === "seconds"
          ? { drill: "dribbling", seconds: value.score }
          : {
              drill: template.id as "free_throws" | "three_point",
              made: value.score,
              attempts: template.attempts ?? 10,
            };
      try {
        await mutateAsync({
          studentId: student.id,
          recordedOn: value.date,
          recordedBy: viewerId,
          data: {
            ...data,
            sport: "basketball",
            eventId: value.session === NO_SESSION ? undefined : value.session,
          },
        });
        toast.success(`Result saved for ${student.name}`);
        onSaved();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not save the result"
        );
      }
    },
  });

  const score = useStore(form.store, (s) => s.values.score);
  const date = useStore(form.store, (s) => s.values.date);
  const sessions = useQuery({
    ...sessionOptionsQueryOptions(academyId, student?.teamId ?? "", date),
    enabled: Boolean(student),
  });
  const sessionItems = [
    ...(sessions.data ?? []).map((s) => ({ value: s.eventId, label: s.label })),
    { value: NO_SESSION, label: "No session" },
  ];
  // Default to the first session that day once they load.
  const firstSession = sessions.data?.[0]?.eventId;
  const sessionsLoaded = Boolean(sessions.data);
  useEffect(() => {
    if (sessionsLoaded) {
      form.setFieldValue("session", firstSession ?? NO_SESSION);
    }
  }, [firstSession, form, sessionsLoaded]);

  const note = bestNote(recent.data ?? [], template, score);

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
      form.setFieldValue("score", null);
      form.setFieldMeta("score", (meta) => ({
        ...meta,
        errors: [],
        errorMap: {},
      }));
      onDrillChange(next);
    },
    [form, onDrillChange]
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

  const chart =
    student && recent.data ? (
      <RecentResults
        current={score}
        firstName={firstName(student.name)}
        results={recent.data}
        template={template}
      />
    ) : null;

  return (
    <div className="flex items-start gap-8 max-md:flex-col max-md:items-stretch max-md:gap-5">
      <form
        className="flex w-full max-w-[560px] flex-col gap-5"
        noValidate
        onSubmit={handleSubmit}
      >
        {students.data ? (
          <StudentCard onChange={openPicker} student={student} />
        ) : (
          <Skeleton className="h-[68px] rounded-md" />
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 font-semibold text-[13px] text-muted uppercase leading-4 tracking-label">
            Template
          </legend>
          <div className="flex flex-wrap gap-[6px]">
            {RESULT_TEMPLATES.map((t) => (
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
            {(field) => <SessionField field={field} items={sessionItems} />}
          </form.Field>
        </div>

        <div className="md:hidden">{chart}</div>

        <form.Subscribe selector={selectSubmit}>
          {(isSubmitting) => (
            <Button
              className="w-full p-4 text-base leading-5"
              disabled={isSubmitting}
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
        students={students.data ?? []}
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
}: {
  field: AnyFieldApi;
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
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
      <span
        className="font-semibold text-ink text-sm leading-[18px]"
        id="result-session-label"
      >
        Session
      </span>
      <Select
        items={items}
        onValueChange={handleValue}
        value={field.state.value}
      >
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
