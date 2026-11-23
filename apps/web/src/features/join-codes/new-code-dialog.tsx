import { Button } from "@hoops-genesis/ui/components/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@hoops-genesis/ui/components/dialog";
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
import { type AnyFieldApi, useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useMemo,
} from "react";
import { toast } from "sonner";
import z from "zod";
import { DIALOG_ERROR_CLASS, QueryBoundary } from "@/components/error-state";
import { CodeReady } from "@/features/join-codes/code-ready";
import {
  codeSummary,
  endOfDayIn,
  plainDayIn,
} from "@/features/join-codes/describe";
import {
  CODE_LIMITS,
  type InvitationCode,
  type InvitationCodeRole,
  useCreateJoinCode,
  useJoinCodesNow,
} from "@/features/join-codes/queries";
import { teamListQueryOptions } from "@/features/teams/queries";
import type { Id } from "@/features/types";
import { errorMessage } from "@/lib/api-client";

const NO_TEAM = "none";
const DAY_MS = 86_400_000;
const MAX_DAYS = 90;
const MIN_GROUP_USES = 2;
const DIGITS_ONLY = /\D/g;
const MAX_COUNT_DIGITS = 4;

const ROLE_ITEMS: { value: InvitationCodeRole; label: string }[] = [
  { value: "student", label: "Student" },
  { value: "coach", label: "Coach" },
];

type UsesChoice = "one" | "upTo" | "unlimited";
type ExpiryChoice = "1" | "7" | "30" | "90" | "date" | "never";

const EXPIRY_ITEMS: { value: ExpiryChoice; label: string }[] = [
  { value: "1", label: "1 day" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "date", label: "Pick a date" },
  { value: "never", label: "Never" },
];

/* "Never" is in the design, but the server makes every code expire within 90 days. */
const UNAVAILABLE_EXPIRY: ExpiryChoice = "never";

interface Values {
  date: string;
  expiry: ExpiryChoice;
  role: InvitationCodeRole;
  teamId: string;
  upTo: string;
  uses: UsesChoice;
}

function makeSchema(today: string, lastDay: string) {
  return z
    .object({
      role: z.enum(["student", "coach"]),
      teamId: z.string(),
      uses: z.enum(["one", "upTo", "unlimited"]),
      upTo: z.string(),
      expiry: z.enum(["1", "7", "30", "90", "date", "never"]),
      date: z.string(),
    })
    .superRefine((value, ctx) => {
      const count = Number(value.upTo);
      const isCountOk =
        Number.isInteger(count) &&
        count >= MIN_GROUP_USES &&
        count <= CODE_LIMITS.maxUses;
      if (value.uses === "upTo" && !isCountOk) {
        ctx.addIssue({
          code: "custom",
          path: ["upTo"],
          message: `Enter a number from ${MIN_GROUP_USES} to ${CODE_LIMITS.maxUses}.`,
        });
      }
      const isDateOk = value.date > today && value.date <= lastDay;
      if (value.expiry === "date" && !isDateOk) {
        ctx.addIssue({
          code: "custom",
          path: ["date"],
          message: "Pick a day from tomorrow up to 90 days away.",
        });
      }
      if (value.expiry === UNAVAILABLE_EXPIRY) {
        ctx.addIssue({
          code: "custom",
          path: ["expiry"],
          message: "Every code stops working within 90 days.",
        });
      }
    });
}

function maxUsesOf(values: Values): number | null {
  if (values.uses === "unlimited") {
    return null;
  }
  return values.uses === "one" ? 1 : Number(values.upTo) || null;
}

function expiresAtOf(
  values: Values,
  now: Date,
  timeZone: string
): string | null {
  if (values.expiry === "never") {
    return null;
  }
  if (values.expiry === "date") {
    if (!values.date) {
      return null;
    }
    const end = endOfDayIn(values.date, timeZone);
    const latest = now.getTime() + CODE_LIMITS.maxLifetimeMs;
    return new Date(Math.min(Date.parse(end), latest)).toISOString();
  }
  return new Date(now.getTime() + Number(values.expiry) * DAY_MS).toISOString();
}

const choiceCard =
  "flex flex-1 basis-0 cursor-pointer flex-col rounded-[14px] border border-line p-3 transition-colors hover:bg-fog/60 has-checked:border-2 has-checked:border-ink has-checked:p-[11px] has-focus-visible:ring-2 has-focus-visible:ring-ink has-focus-visible:ring-offset-2";

const expiryChip =
  "cursor-pointer rounded-full border border-line px-[14px] py-[9px] font-medium text-ink text-sm leading-[18px] transition-colors hover:bg-fog has-checked:border-ink has-checked:bg-ink has-checked:font-semibold has-checked:text-white has-disabled:cursor-not-allowed has-disabled:text-muted has-disabled:opacity-60 has-disabled:hover:bg-white has-focus-visible:ring-2 has-focus-visible:ring-ink has-focus-visible:ring-offset-2";

function errorText(errors: unknown[]): string | null {
  const first = errors[0] as { message?: string } | string | undefined;
  if (!first) {
    return null;
  }
  return typeof first === "string" ? first : (first.message ?? null);
}

function RoleControl({ field }: { field: AnyFieldApi }) {
  const handleChange = useCallback(
    (values: unknown[]) => {
      const [next] = values;
      if (next === "student" || next === "coach") {
        field.handleChange(next);
      }
    },
    [field]
  );
  return (
    <Field className="flex-1 basis-0">
      <Label id="code-role-label">Joins as</Label>
      <ToggleGroup
        aria-labelledby="code-role-label"
        className="md:rounded-[14px]"
        onValueChange={handleChange}
        value={[field.state.value as string]}
      >
        {ROLE_ITEMS.map((item) => (
          <ToggleGroupItem
            className="md:rounded-[10px] md:text-[15px] md:leading-5"
            key={item.value}
            value={item.value}
          >
            {item.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}

function TeamControl({
  field,
  items,
}: {
  field: AnyFieldApi;
  items: { value: string; label: string }[];
}) {
  const handleChange = useCallback(
    (next: string | null) => field.handleChange(next ?? NO_TEAM),
    [field]
  );
  return (
    <Field className="flex-1 basis-0">
      <Label htmlFor="code-team">
        Team <LabelHint>(optional)</LabelHint>
      </Label>
      <Select
        items={items}
        onValueChange={handleChange}
        value={field.state.value as string}
      >
        <SelectTrigger className="py-[13px]" id="code-team">
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
    </Field>
  );
}

function UsesControl({
  usesField,
  upToField,
}: {
  usesField: AnyFieldApi;
  upToField: AnyFieldApi;
}) {
  const uses = usesField.state.value as UsesChoice;
  const handleUses = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      usesField.handleChange(event.currentTarget.value as UsesChoice),
    [usesField]
  );
  const handleCount = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      upToField.handleChange(
        event.currentTarget.value
          .replace(DIGITS_ONLY, "")
          .slice(0, MAX_COUNT_DIGITS)
      ),
    [upToField]
  );
  const handleCountFocus = useCallback(
    () => usesField.handleChange("upTo"),
    [usesField]
  );
  const message =
    uses === "upTo" ? errorText(upToField.state.meta.errors) : null;

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-semibold text-ink text-sm leading-[18px]">
        How many people can use it
      </legend>
      <div className="flex gap-2">
        <label className={choiceCard}>
          <input
            checked={uses === "one"}
            className="sr-only"
            name="uses"
            onChange={handleUses}
            type="radio"
            value="one"
          />
          <span className="font-semibold text-[15px] text-ink leading-5">
            One person
          </span>
          <span className="mt-[2px] text-muted text-xs leading-4">Default</span>
        </label>
        <label className={choiceCard}>
          <input
            checked={uses === "upTo"}
            className="sr-only"
            name="uses"
            onChange={handleUses}
            type="radio"
            value="upTo"
          />
          <span className="font-semibold text-[15px] text-ink leading-5">
            Up to
          </span>
          <span className="mt-[6px] flex items-center gap-[6px]">
            <input
              aria-describedby={message ? "code-uses-error" : undefined}
              aria-invalid={message ? true : undefined}
              aria-label="Most people who can use it"
              className="w-[52px] rounded-sm border-2 border-transparent bg-fog px-2 py-[2px] font-semibold text-[15px] text-ink leading-5 outline-none focus-visible:border-ink aria-invalid:border-orange-deep max-md:w-[44px]"
              inputMode="numeric"
              onChange={handleCount}
              onFocus={handleCountFocus}
              value={upToField.state.value as string}
            />
            <span className="whitespace-nowrap text-[13px] text-muted leading-4">
              max {CODE_LIMITS.maxUses}
            </span>
          </span>
        </label>
        <label className={choiceCard}>
          <input
            checked={uses === "unlimited"}
            className="sr-only"
            name="uses"
            onChange={handleUses}
            type="radio"
            value="unlimited"
          />
          <span className="font-semibold text-[15px] text-ink leading-5">
            No limit
          </span>
          <span className="mt-[2px] text-muted text-xs leading-4">
            Needs an expiry
          </span>
        </label>
      </div>
      {message ? (
        <FieldMessage id="code-uses-error" tone="error">
          {message}
        </FieldMessage>
      ) : null}
    </fieldset>
  );
}

function DateControl({
  field,
  min,
  max,
}: {
  field: AnyFieldApi;
  min: string;
  max: string;
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      field.handleChange(event.currentTarget.value),
    [field]
  );
  const message = errorText(field.state.meta.errors);
  return (
    <Field className="mt-1">
      <Label className="sr-only" htmlFor="code-date">
        Last day it works
      </Label>
      <input
        aria-describedby={message ? "code-date-error" : undefined}
        aria-invalid={message ? true : undefined}
        className="w-fit rounded-[14px] border-2 border-transparent bg-fog px-[14px] py-[10px] text-[15px] text-ink leading-5 outline-none focus-visible:border-ink aria-invalid:border-orange-deep"
        id="code-date"
        max={max}
        min={min}
        onChange={handleChange}
        type="date"
        value={field.state.value as string}
      />
      {message ? (
        <FieldMessage id="code-date-error" tone="error">
          {message}
        </FieldMessage>
      ) : null}
    </Field>
  );
}

function ExpiryControl({
  field,
  dateControl,
}: {
  field: AnyFieldApi;
  dateControl: ReactNode;
}) {
  const expiry = field.state.value as ExpiryChoice;
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      field.handleChange(event.currentTarget.value as ExpiryChoice),
    [field]
  );
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-semibold text-ink text-sm leading-[18px]">
        Stops working after
      </legend>
      <div className="flex flex-wrap gap-2">
        {EXPIRY_ITEMS.map((item) => (
          <label className={expiryChip} key={item.value}>
            <input
              aria-describedby="code-expiry-hint"
              checked={expiry === item.value}
              className="sr-only"
              disabled={item.value === UNAVAILABLE_EXPIRY}
              name="expiry"
              onChange={handleChange}
              type="radio"
              value={item.value}
            />
            {item.label}
          </label>
        ))}
      </div>
      {expiry === "date" ? dateControl : null}
      <p
        className="text-[13px] text-muted leading-[18px]"
        id="code-expiry-hint"
      >
        Every code stops working by itself. Dates can be up to 90 days away.
      </p>
    </fieldset>
  );
}

interface FooterState {
  canSubmit: boolean;
  isSubmitting: boolean;
  values: Values;
}

const selectFooter = (state: FooterState): FooterState => ({
  values: state.values,
  canSubmit: state.canSubmit,
  isSubmitting: state.isSubmitting,
});

function NewCodeForm({
  academyId,
  academyName,
  initialTeamId,
  onCreated,
  timeZone,
}: {
  academyId: Id;
  academyName: string;
  /** Preselected team (e.g. "Make a join code" right after creating a team). */
  initialTeamId?: Id;
  onCreated: (code: InvitationCode) => void;
  timeZone: string;
}) {
  const now = useJoinCodesNow();
  const create = useCreateJoinCode();
  const teams = useQuery(teamListQueryOptions(academyId)).data ?? [];
  const teamItems = useMemo(
    () => [
      { value: NO_TEAM, label: "No team" },
      ...teams.map((t) => ({ value: t.team.id, label: t.team.name })),
    ],
    [teams]
  );
  const today = plainDayIn(now, timeZone);
  const tomorrow = plainDayIn(now, timeZone, 1);
  const lastDay = plainDayIn(now, timeZone, MAX_DAYS);
  const schema = useMemo(() => makeSchema(today, lastDay), [today, lastDay]);

  const form = useForm({
    defaultValues: {
      role: "student",
      teamId: initialTeamId ?? NO_TEAM,
      uses: "one",
      upTo: "20",
      expiry: "7",
      date: "",
    } as Values,
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      const expiresAt = expiresAtOf(value, now, timeZone);
      try {
        const code = await create.mutateAsync({
          academyId,
          role: value.role,
          teamId: value.teamId === NO_TEAM ? undefined : value.teamId,
          maxUses: maxUsesOf(value),
          expiresAt: expiresAt ?? undefined,
        });
        onCreated(code);
      } catch (error) {
        toast.error(
          errorMessage(error, "Couldn't create the code. Try again.")
        );
      }
    },
  });

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      event.stopPropagation();
      form.handleSubmit();
    },
    [form]
  );

  const teamName = useCallback(
    (teamId: string) =>
      teamId === NO_TEAM
        ? null
        : (teamItems.find((t) => t.value === teamId)?.label ?? null),
    [teamItems]
  );

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      noValidate
      onSubmit={handleSubmit}
    >
      <DialogBody className="gap-5 pt-3 pb-[22px] max-md:gap-[22px]">
        <p className="sr-only">Anyone with the code can join {academyName}.</p>
        <div className="flex gap-3 max-md:flex-col max-md:gap-[22px]">
          <form.Field name="role">
            {(field) => <RoleControl field={field} />}
          </form.Field>
          <form.Field name="teamId">
            {(field) => <TeamControl field={field} items={teamItems} />}
          </form.Field>
        </div>
        <form.Field name="uses">
          {(usesField) => (
            <form.Field name="upTo">
              {(upToField) => (
                <UsesControl upToField={upToField} usesField={usesField} />
              )}
            </form.Field>
          )}
        </form.Field>
        <form.Field name="expiry">
          {(field) => (
            <ExpiryControl
              dateControl={
                <form.Field name="date">
                  {(dateField) => (
                    <DateControl
                      field={dateField}
                      max={lastDay}
                      min={tomorrow}
                    />
                  )}
                </form.Field>
              }
              field={field}
            />
          )}
        </form.Field>
      </DialogBody>
      <form.Subscribe selector={selectFooter}>
        {({ values, canSubmit, isSubmitting }) => (
          <DialogFooter className="gap-4 md:justify-between">
            <p className="text-ink-soft text-sm leading-[19px] max-md:text-center max-md:text-[13px] max-md:text-muted">
              {codeSummary({
                role: values.role,
                teamName: teamName(values.teamId),
                maxUses: maxUsesOf(values),
                expiresAt: expiresAtOf(values, now, timeZone),
                timeZone,
              })}
            </p>
            <Button
              className="px-[22px] text-[15px] leading-5"
              disabled={!canSubmit || isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Creating…" : "Create code"}
            </Button>
          </DialogFooter>
        )}
      </form.Subscribe>
    </form>
  );
}

/**
 * "New join code" (6AE-0) then "Code ready" (6RV-0; phone 6WV-0) in one dialog.
 * The route keeps the step in the URL: `?new=1`, then `?created=<id>`.
 */
export function NewCodeDialog({
  academyId,
  academyName,
  createdCode,
  initialTeamId,
  onCreated,
  onOpenChange,
  open,
  timeZone,
}: {
  academyId: Id;
  academyName: string;
  createdCode: InvitationCode | null;
  /** Team to preselect in the form (`?new=1&teamId=<id>`). */
  initialTeamId?: Id;
  onCreated: (code: InvitationCode) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  timeZone: string;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="md:rounded-[28px]" mobile="fullscreen">
        {createdCode ? (
          <CodeReady
            academyName={academyName}
            code={createdCode}
            onDone={close}
            timeZone={timeZone}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="md:text-2xl md:leading-10">
                New join code
              </DialogTitle>
              <DialogDescription className="text-sm leading-5">
                Anyone with the code can join {academyName}.
              </DialogDescription>
            </DialogHeader>
            {open ? (
              <QueryBoundary
                className={DIALOG_ERROR_CLASS}
                what="the code form"
              >
                <NewCodeForm
                  academyId={academyId}
                  academyName={academyName}
                  initialTeamId={initialTeamId}
                  onCreated={onCreated}
                  timeZone={timeZone}
                />
              </QueryBoundary>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
