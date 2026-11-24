/*
 * The dialogs behind the member detail actions: move a student, change a coach's
 * teams, and the confirmations for role changes and removals. Each one runs the Better
 * Auth call the server allows for the signed-in role (see ./api.ts) and shows the
 * server's refusal as written ("A student can be on only one team per academy").
 */
import { Button } from "@hoops-genesis/ui/components/button";
import { Checkbox } from "@hoops-genesis/ui/components/checkbox";
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
import { FieldMessage } from "@hoops-genesis/ui/components/label";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { type ChangeEvent, type ReactNode, useCallback, useState } from "react";
import { toast } from "sonner";

import { QueryBoundary } from "@/components/error-state";
import {
  type MemberProfile,
  useMoveStudent,
  useSetCoachTeams,
} from "@/features/member-detail/queries";
import { teamListQueryOptions } from "@/features/teams/queries";
import type { Id } from "@/features/types";
import { errorMessage } from "@/lib/api-client";
import { firstName } from "@/lib/format";

const NO_TEAM = "";

function OptionRow({
  children,
  control,
  selected,
}: {
  children: ReactNode;
  control: ReactNode;
  selected: boolean;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed in as a child.
    <label
      className={cn(
        "flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] border px-4 py-3 text-[15px] leading-5",
        selected ? "border-ink" : "border-line"
      )}
    >
      {control}
      {children}
    </label>
  );
}

interface TeamChoice {
  coachCount: number;
  id: Id;
  name: string;
}

/** The academy's teams, or undefined while they load (errors reach QueryBoundary). */
function useTeamChoices(academyId: Id): TeamChoice[] | undefined {
  const teams = useQuery(teamListQueryOptions(academyId)).data;
  return teams?.map((t) => ({
    id: t.team.id,
    name: t.team.name,
    coachCount: t.coaches.length,
  }));
}

function TeamCheckbox({
  team,
  checked,
  onToggle,
}: {
  team: TeamChoice;
  checked: boolean;
  onToggle: (teamId: Id, checked: boolean) => void;
}) {
  const handle = useCallback(
    (next: boolean) => onToggle(team.id, next),
    [onToggle, team.id]
  );
  return (
    <OptionRow
      control={
        <Checkbox
          aria-label={team.name}
          checked={checked}
          onCheckedChange={handle}
        />
      }
      selected={checked}
    >
      <span className="flex-1 font-medium text-ink">{team.name}</span>
      <span className="text-muted text-sm">
        {team.coachCount === 1 ? "1 coach" : `${team.coachCount} coaches`}
      </span>
    </OptionRow>
  );
}

function LoadingTeams() {
  return <p className="text-muted text-sm">Loading teams…</p>;
}

function MoveForm({
  academyId,
  profile,
  onDone,
}: {
  academyId: Id;
  profile: MemberProfile;
  onDone: () => void;
}) {
  const current = profile.teams[0]?.id ?? NO_TEAM;
  const [choice, setChoice] = useState<string>(current);
  const move = useMoveStudent();
  const teams = useTeamChoices(academyId);
  const name = firstName(profile.name);
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setChoice(event.target.value),
    []
  );
  const toName = teams?.find((t) => t.id === choice)?.name ?? "the team";
  const submit = useCallback(() => {
    move.mutate(
      {
        academyId,
        userId: profile.userId,
        fromTeamId: current || null,
        toTeamId: choice || null,
      },
      {
        onSuccess: () => {
          toast.success(
            choice
              ? `${name} is on ${toName} now.`
              : `${name} is off their team.`
          );
          onDone();
        },
      }
    );
  }, [move, academyId, profile.userId, current, choice, name, onDone, toName]);
  return (
    <>
      <DialogBody className="flex flex-col gap-2">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Team</legend>
          {teams ? (
            [...teams, { id: NO_TEAM, name: "No team", coachCount: 0 }].map(
              (team) => (
                <OptionRow
                  control={
                    <input
                      checked={choice === team.id}
                      className="size-[18px] accent-ink"
                      name="team"
                      onChange={handleChange}
                      type="radio"
                      value={team.id}
                    />
                  }
                  key={team.id || "none"}
                  selected={choice === team.id}
                >
                  <span className="flex-1 font-medium text-ink">
                    {team.name}
                  </span>
                  {team.id === current ? (
                    <span className="text-muted text-sm">Now</span>
                  ) : null}
                </OptionRow>
              )
            )
          ) : (
            <LoadingTeams />
          )}
        </fieldset>
        {move.error ? (
          <FieldMessage role="alert" tone="error">
            {errorMessage(move.error, "Couldn't move them. Try again.")}
          </FieldMessage>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button
          disabled={move.isPending || choice === current}
          onClick={submit}
        >
          {move.isPending ? "Moving…" : "Move"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Move team (8JO-0, 7F2-0): one team per student; the old team comes off first. */
export function MoveTeamDialog({
  academyId,
  profile,
  open,
  onOpenChange,
}: {
  academyId: Id;
  profile: MemberProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const name = firstName(profile.name);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {name} to another team</DialogTitle>
          <DialogDescription>
            A student is on one team at a time. {name} comes off{" "}
            {profile.teams[0]?.name ?? "no team"} and joins the one you pick.
            The change is written to the activity log.
          </DialogDescription>
        </DialogHeader>
        <QueryBoundary what="teams">
          {open ? (
            <MoveForm academyId={academyId} onDone={close} profile={profile} />
          ) : null}
        </QueryBoundary>
      </DialogContent>
    </Dialog>
  );
}

function TeamsForm({
  academyId,
  profile,
  onDone,
}: {
  academyId: Id;
  profile: MemberProfile;
  onDone: () => void;
}) {
  const current = profile.teams.map((t) => t.id);
  const [chosen, setChosen] = useState<Id[]>(current);
  const save = useSetCoachTeams();
  const teams = useTeamChoices(academyId);
  const add = chosen.filter((id) => !current.includes(id));
  const remove = current.filter((id) => !chosen.includes(id));
  const toggle = useCallback(
    (teamId: Id, checked: boolean) =>
      setChosen((prev) =>
        checked ? [...prev, teamId] : prev.filter((id) => id !== teamId)
      ),
    []
  );
  const submit = useCallback(() => {
    save.mutate(
      { academyId, userId: profile.userId, add, remove },
      {
        onSuccess: () => {
          toast.success(`${firstName(profile.name)}’s teams are saved.`);
          onDone();
        },
      }
    );
  }, [save, academyId, profile, add, remove, onDone]);
  return (
    <>
      <DialogBody className="flex flex-col gap-2">
        {teams ? (
          teams.map((team) => (
            <TeamCheckbox
              checked={chosen.includes(team.id)}
              key={team.id}
              onToggle={toggle}
              team={team}
            />
          ))
        ) : (
          <LoadingTeams />
        )}
        {save.error ? (
          <FieldMessage role="alert" tone="error">
            {errorMessage(save.error, "Couldn't save the teams. Try again.")}
          </FieldMessage>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button
          disabled={save.isPending || (add.length === 0 && remove.length === 0)}
          onClick={submit}
        >
          {save.isPending ? "Saving…" : "Save teams"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Change teams (DNS-0, CHQ-0): coaches can be on several teams. */
export function CoachTeamsDialog({
  academyId,
  profile,
  open,
  onOpenChange,
}: {
  academyId: Id;
  profile: MemberProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{firstName(profile.name)}’s teams</DialogTitle>
          <DialogDescription>
            Coaches see and take attendance for the teams they are on. Each
            change is written to the activity log.
          </DialogDescription>
        </DialogHeader>
        <QueryBoundary what="teams">
          {open ? (
            <TeamsForm academyId={academyId} onDone={close} profile={profile} />
          ) : null}
        </QueryBoundary>
      </DialogContent>
    </Dialog>
  );
}

/** A yes/no confirmation for role changes and removals. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  destructive = false,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  destructive?: boolean;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  const buttonLabel = pending ? pendingLabel : confirmLabel;
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <DialogBody>
            <FieldMessage role="alert" tone="error">
              {error}
            </FieldMessage>
          </DialogBody>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button
            disabled={pending}
            onClick={onConfirm}
            variant={destructive ? "destructive" : "default"}
          >
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
