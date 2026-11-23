import { Button } from "@hoops-genesis/ui/components/button";
import { Checkbox } from "@hoops-genesis/ui/components/checkbox";
import { FilterChip } from "@hoops-genesis/ui/components/chip";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@hoops-genesis/ui/components/dialog";
import { Field, Label, LabelHint } from "@hoops-genesis/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hoops-genesis/ui/components/select";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@hoops-genesis/ui/components/toggle-group";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import {
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useMemo,
} from "react";
import { toast } from "sonner";
import z from "zod";

import { ErrorState, failedQueries } from "@/components/error-state";
import { FormTextField } from "@/components/form-text-field";
import {
  CoachChipsInput,
  CoachPickerPhone,
} from "@/features/teams/coach-picker";
import {
  type CoachCandidate,
  coachCandidatesQueryOptions,
  studentsWithoutTeamQueryOptions,
  teamListQueryOptions,
  teamSportStored,
  useCreateTeam,
} from "@/features/teams/queries";
import type { Id, Team } from "@/features/types";
import { useViewer } from "@/features/viewer/queries";
import { errorMessage } from "@/lib/api-client";
import { useIsPhone } from "@/lib/use-is-phone";

const NAME_MAX = 40;
const NAME_INPUT_ID = "name";
const COACH_INPUT_ID = "create-team-coach";
const COACH_LABEL_ID = "create-team-coaches-label";
const NO_AGE_GROUP = "none";

/** Age groups offered in 75J-0 / 7DB-0. */
const AGE_GROUPS = ["U10", "U12", "U14", "U16", "U18", "Adults"] as const;
const AGE_GROUP_ITEMS = [
  { value: NO_AGE_GROUP, label: "No age group" },
  ...AGE_GROUPS.map((group) => ({ value: group, label: group })),
];

const SPORTS = ["Basketball", "Football", "Other"] as const;
type Sport = (typeof SPORTS)[number];

/** What to open once the team exists ("Then fill the team"). */
export type CreateTeamNextStep = "join-code" | "invite" | "add-existing";

function isSport(value: unknown): value is Sport {
  return SPORTS.includes(value as Sport);
}

function focusName(): HTMLElement | null {
  return document.getElementById(NAME_INPUT_ID);
}

function buildSchema(takenNames: Set<string>) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, "Give the team a name")
      .max(NAME_MAX, `Keep it under ${NAME_MAX} characters`)
      .refine(
        (name) => !takenNames.has(name.toLowerCase()),
        "You already have a team with this name"
      ),
    ageGroup: z.string(),
    sport: z.enum(SPORTS),
    coachIds: z.array(z.string()),
    joinCode: z.boolean(),
    invite: z.boolean(),
    addExisting: z.boolean(),
  });
}

/** Sport buttons: separate 14px boxes on web and phone (75J-0 / 7DB-0). */
function SportField({
  value,
  onChange,
}: {
  value: Sport;
  onChange: (sport: Sport) => void;
}) {
  const handleChange = useCallback(
    (values: unknown[]) => {
      const [next] = values;
      if (isSport(next)) {
        onChange(next);
      }
    },
    [onChange]
  );
  return (
    <Field>
      <Label id="create-team-sport-label">Sport</Label>
      <ToggleGroup
        aria-labelledby="create-team-sport-label"
        className="gap-2 rounded-none bg-transparent p-0"
        onValueChange={handleChange}
        value={[value]}
      >
        {SPORTS.map((sport) => (
          <ToggleGroupItem
            className="rounded-[14px] border border-line bg-white p-[11px] font-medium text-[15px] text-ink leading-5 hover:bg-fog data-pressed:border-2 data-pressed:border-ink data-pressed:bg-white data-pressed:p-[10px] data-pressed:font-semibold data-pressed:shadow-none"
            key={sport}
            value={sport}
          >
            {sport}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}

const optionalHint = <LabelHint>(optional)</LabelHint>;

function AgeGroupSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const handleChange = useCallback(
    (next: string | null) =>
      onChange(!next || next === NO_AGE_GROUP ? "" : next),
    [onChange]
  );
  return (
    <Field className="flex-1">
      <Label htmlFor="create-team-age">Age group {optionalHint}</Label>
      <Select
        items={AGE_GROUP_ITEMS}
        onValueChange={handleChange}
        value={value || NO_AGE_GROUP}
      >
        <SelectTrigger
          className="py-[13px] text-base leading-5"
          id="create-team-age"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AGE_GROUP_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function AgeGroupChips({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const { group = "" } = event.currentTarget.dataset;
      onChange(group === value ? "" : group);
    },
    [onChange, value]
  );
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-semibold text-ink text-sm leading-[18px]">
        Age group {optionalHint}
      </legend>
      <div className="flex flex-wrap gap-2">
        {AGE_GROUPS.map((group) => (
          <FilterChip
            className="px-[14px] py-[9px]"
            data-group={group}
            key={group}
            onClick={handleClick}
            selected={value === group}
          >
            {group}
          </FilterChip>
        ))}
      </div>
    </fieldset>
  );
}

/** One "Then fill the team" checkbox row. */
function StepCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox inside is the control.
    <label className="flex cursor-pointer items-center gap-[10px] text-ink text-sm leading-[19px]">
      <Checkbox
        checked={checked}
        className="size-5 border-[#B5B5B5]"
        onCheckedChange={onChange}
      />
      <span>{children}</span>
    </label>
  );
}

function defaultCoachIds(candidates: CoachCandidate[], viewerId: Id): Id[] {
  const me = candidates.find((c) => c.user.id === viewerId);
  return me ? [me.user.id] : [];
}

function nextStepOf(value: {
  joinCode: boolean;
  invite: boolean;
  addExisting: boolean;
}): CreateTeamNextStep | null {
  if (value.joinCode) {
    return "join-code";
  }
  if (value.invite) {
    return "invite";
  }
  return value.addExisting ? "add-existing" : null;
}

function CreateTeamForm({
  academyId,
  candidates,
  takenNames,
  withoutTeamCount,
  onCreated,
}: {
  academyId: Id;
  candidates: CoachCandidate[];
  takenNames: Set<string>;
  withoutTeamCount: number;
  onCreated: (team: Team, next: CreateTeamNextStep | null) => void;
}) {
  const viewer = useViewer();
  const isPhone = useIsPhone();
  const createTeam = useCreateTeam();
  const schema = useMemo(() => buildSchema(takenNames), [takenNames]);
  const form = useForm({
    defaultValues: {
      name: "",
      ageGroup: "",
      sport: "Basketball" as Sport,
      coachIds: defaultCoachIds(candidates, viewer.user.id),
      joinCode: true,
      invite: false,
      addExisting: false,
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      try {
        const team = await createTeam.mutateAsync({
          academyId,
          name: value.name,
          ageGroup: value.ageGroup || null,
          sport: value.sport === "Other" ? null : value.sport,
          coachUserIds: value.coachIds,
        });
        toast.success(`${team.name} created.`);
        onCreated(team, nextStepOf(value));
      } catch (error) {
        toast.error(
          errorMessage(error, "Couldn’t create the team. Try again.")
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

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      noValidate
      onSubmit={handleSubmit}
    >
      <DialogBody className="gap-5 max-md:gap-[18px] max-md:pt-2 md:pt-5 md:pb-[22px]">
        <div className="flex gap-3 max-md:flex-col max-md:gap-[18px]">
          <div className="min-w-0 grow-[1.3] basis-0">
            <form.Field name="name">
              {(field) => (
                <FormTextField
                  autoComplete="off"
                  // The form mounts once its data loads, which can be after the
                  // dialog's initialFocus ran; autoFocus covers that case.
                  autoFocus
                  className="py-[13px] text-base leading-5 max-md:px-4 max-md:py-3.5"
                  description="Must be different from your other teams."
                  descriptionClassName="text-[12px] leading-4 max-md:hidden"
                  field={field}
                  label="Team name"
                  maxLength={NAME_MAX + 10}
                  placeholder="Girls U12"
                />
              )}
            </form.Field>
          </div>
          <form.Field name="ageGroup">
            {(field) =>
              isPhone ? (
                <AgeGroupChips
                  onChange={field.handleChange}
                  value={field.state.value}
                />
              ) : (
                <div className="min-w-0 grow basis-0">
                  <AgeGroupSelect
                    onChange={field.handleChange}
                    value={field.state.value}
                  />
                </div>
              )
            }
          </form.Field>
        </div>
        {/* No sport column on teams yet: the field shows only in preview. */}
        {teamSportStored ? (
          <form.Field name="sport">
            {(field) => (
              <SportField
                onChange={field.handleChange}
                value={field.state.value}
              />
            )}
          </form.Field>
        ) : null}
        <form.Field name="coachIds">
          {(field) => (
            <Field>
              {isPhone ? (
                <Label id={COACH_LABEL_ID}>Coaches</Label>
              ) : (
                <Label htmlFor={COACH_INPUT_ID} id={COACH_LABEL_ID}>
                  Coaches <LabelHint>(you can add them later)</LabelHint>
                </Label>
              )}
              {isPhone ? (
                <CoachPickerPhone
                  candidates={candidates}
                  labelledBy={COACH_LABEL_ID}
                  onChange={field.handleChange}
                  value={field.state.value}
                />
              ) : (
                <CoachChipsInput
                  candidates={candidates}
                  id={COACH_INPUT_ID}
                  labelledBy={COACH_LABEL_ID}
                  onChange={field.handleChange}
                  value={field.state.value}
                />
              )}
            </Field>
          )}
        </form.Field>
        {isPhone ? (
          <div className="rounded-md bg-fog p-[14px]">
            <form.Field name="joinCode">
              {(field) => (
                <StepCheckbox
                  checked={field.state.value}
                  onChange={field.handleChange}
                >
                  Then make a student join code for it
                </StepCheckbox>
              )}
            </form.Field>
          </div>
        ) : (
          <fieldset className="flex flex-col gap-[10px] rounded-md bg-fog p-[14px]">
            <legend className="float-left mb-0 font-semibold text-ink text-sm leading-[18px]">
              Then fill the team
            </legend>
            <form.Field name="joinCode">
              {(field) => (
                <StepCheckbox
                  checked={field.state.value}
                  onChange={field.handleChange}
                >
                  Make a student join code for this team
                </StepCheckbox>
              )}
            </form.Field>
            <form.Field name="invite">
              {(field) => (
                <StepCheckbox
                  checked={field.state.value}
                  onChange={field.handleChange}
                >
                  Invite students by email
                </StepCheckbox>
              )}
            </form.Field>
            <form.Field name="addExisting">
              {(field) => (
                <StepCheckbox
                  checked={field.state.value}
                  onChange={field.handleChange}
                >
                  Add students already in the academy
                  {withoutTeamCount > 0 ? (
                    <span className="text-muted">
                      {" "}
                      ({withoutTeamCount} without a team)
                    </span>
                  ) : null}
                </StepCheckbox>
              )}
            </form.Field>
          </fieldset>
        )}
      </DialogBody>
      <DialogFooter className="gap-3 max-md:pb-[max(36px,env(safe-area-inset-bottom))]">
        <DialogClose
          render={
            <Button
              className="px-[18px] font-semibold leading-5 max-md:hidden"
              variant="ghost"
            />
          }
        >
          Cancel
        </DialogClose>
        <Button
          className="px-[22px] font-semibold leading-5 max-md:py-[18px]"
          disabled={createTeam.isPending}
          type="submit"
        >
          {createTeam.isPending ? "Creating…" : "Create team"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function FormSkeleton() {
  return (
    <DialogBody className="gap-5">
      <Skeleton className="h-[72px]" />
      <Skeleton className="h-[72px]" />
      <Skeleton className="h-[72px]" />
      <Skeleton className="h-[136px]" />
    </DialogBody>
  );
}

/**
 * Create team: desktop modal (75J-0), phone full-screen page (7DB-0). Story AO-3.
 * Open state lives in the URL (`?create=1`).
 */
export function CreateTeamDialog({
  academyId,
  open,
  onOpenChange,
  onCreated,
}: {
  academyId: Id;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the team exists, with the "Then fill the team" step to open (if any). */
  onCreated: (team: Team, next: CreateTeamNextStep | null) => void;
}) {
  // These load while the dialog is closed too, so a failure is shown inside the
  // dialog (when it opens) instead of taking down the Teams page.
  const teams = useQuery({
    ...teamListQueryOptions(academyId),
    throwOnError: false,
  });
  const candidates = useQuery({
    ...coachCandidatesQueryOptions(academyId),
    throwOnError: false,
  });
  const withoutTeam = useQuery({
    ...studentsWithoutTeamQueryOptions(academyId),
    throwOnError: false,
  });
  const takenNames = useMemo(
    () => new Set((teams.data ?? []).map((t) => t.team.name.toLowerCase())),
    [teams.data]
  );
  const ready = Boolean(teams.data && candidates.data);
  const failed = ready ? null : failedQueries(teams, candidates);
  const withoutTeamCount = withoutTeam.data?.length ?? 0;
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="md:max-w-[540px] md:rounded-[28px]"
        initialFocus={focusName}
        mobile="fullscreen"
      >
        <DialogHeader className="md:gap-0 md:pb-0 md:[&_[data-slot=dialog-close]]:size-10">
          <DialogTitle className="md:text-2xl md:leading-10">
            Create team
          </DialogTitle>
          <DialogDescription className="md:text-sm md:leading-5">
            Coaches see only their teams. Students check in to their team’s
            sessions.
          </DialogDescription>
        </DialogHeader>
        {open && ready ? (
          <CreateTeamForm
            academyId={academyId}
            candidates={candidates.data ?? []}
            onCreated={onCreated}
            takenNames={takenNames}
            withoutTeamCount={withoutTeamCount}
          />
        ) : null}
        {open && failed ? (
          <DialogBody>
            <ErrorState
              error={failed.error}
              onRetry={failed.retry}
              what="the team form"
            />
          </DialogBody>
        ) : null}
        {open && !(ready || failed) ? <FormSkeleton /> : null}
      </DialogContent>
    </Dialog>
  );
}
