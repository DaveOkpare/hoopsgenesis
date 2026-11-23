import { Button } from "@hoops-genesis/ui/components/button";
import { FilterChip } from "@hoops-genesis/ui/components/chip";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogFooterNote,
  DialogHeader,
  DialogTitle,
} from "@hoops-genesis/ui/components/dialog";
import { Field, FieldMessage, Label } from "@hoops-genesis/ui/components/label";
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
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import {
  type FormEvent,
  type MouseEvent,
  useCallback,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import z from "zod";
import { DIALOG_ERROR_CLASS, QueryBoundary } from "@/components/error-state";
import {
  EmailChipsInput,
  type EmailStatus,
  isEmail,
  splitEmails,
} from "@/features/members/email-chips-input";
import {
  type InvitableRole,
  invitationsQueryOptions,
  membersQueryOptions,
  platformOwnerQueryOptions,
  useInviteMembers,
} from "@/features/members/queries";
import {
  type TeamListItem,
  teamListQueryOptions,
} from "@/features/teams/queries";
import type { Id } from "@/features/types";
import { errorMessage } from "@/lib/api-client";
import { useIsPhone } from "@/lib/use-is-phone";

const NO_TEAM = "none";
const EMAILS_INPUT_ID = "invite-emails";

const ROLE_ITEMS: { value: InvitableRole; label: string }[] = [
  { value: "student", label: "Student" },
  { value: "coach", label: "Coach" },
];

const schema = z.object({
  emails: z.array(z.string()),
  role: z.enum(["student", "coach"]),
  teamId: z.string(),
});

function inviteWord(count: number): string {
  return count === 1 ? "invite" : "invites";
}

function isInvitableRole(value: unknown): value is InvitableRole {
  return value === "student" || value === "coach";
}

function focusEmailsInput(): HTMLElement | null {
  return document.getElementById(EMAILS_INPUT_ID);
}

function selectEmails(state: { values: { emails: string[] } }): string[] {
  return state.values.emails;
}

function useEmailStatus(academyId: Id) {
  const members = useQuery(membersQueryOptions(academyId)).data;
  const invites = useQuery(invitationsQueryOptions(academyId)).data;
  return useMemo(() => {
    const memberEmails = new Set((members ?? []).map((m) => m.user.email));
    const pending = new Set(
      (invites ?? []).filter((i) => i.status === "pending").map((i) => i.email)
    );
    return (email: string): EmailStatus => {
      if (!isEmail(email)) {
        return "invalid";
      }
      if (memberEmails.has(email)) {
        return "member";
      }
      return pending.has(email) ? "invited" : "ok";
    };
  }, [members, invites]);
}

function RoleField({
  value,
  onChange,
  isPhone,
  ownerName,
}: {
  value: InvitableRole;
  onChange: (role: InvitableRole) => void;
  isPhone: boolean;
  ownerName: string | null;
}) {
  const handleToggle = useCallback(
    (values: unknown[]) => {
      const [next] = values;
      if (isInvitableRole(next)) {
        onChange(next);
      }
    },
    [onChange]
  );
  const handleSelect = useCallback(
    (next: unknown) => {
      if (isInvitableRole(next)) {
        onChange(next);
      }
    },
    [onChange]
  );
  if (isPhone) {
    return (
      <Field className="flex-1">
        <Label id="invite-role-label">Role</Label>
        <ToggleGroup
          aria-labelledby="invite-role-label"
          onValueChange={handleToggle}
          value={[value]}
        >
          {ROLE_ITEMS.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {ownerName ? (
          <p className="text-[13px] text-muted leading-[18px]">
            New admins are appointed by {ownerName}, the owner.
          </p>
        ) : null}
      </Field>
    );
  }
  return (
    <Field className="flex-1">
      <Label htmlFor="invite-role">Role</Label>
      <Select items={ROLE_ITEMS} onValueChange={handleSelect} value={value}>
        <SelectTrigger className="px-4 py-[14px]" id="invite-role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function TeamField({
  value,
  onChange,
  isPhone,
  teams,
}: {
  value: string;
  onChange: (teamId: string) => void;
  isPhone: boolean;
  teams: TeamListItem[];
}) {
  const items = useMemo(
    () => [
      { value: NO_TEAM, label: "No team" },
      ...teams.map((t) => ({ value: t.team.id, label: t.team.name })),
    ],
    [teams]
  );
  const handleSelect = useCallback(
    (next: string | null) => onChange(next ?? NO_TEAM),
    [onChange]
  );
  const handleChip = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const { teamId = NO_TEAM } = event.currentTarget.dataset;
      onChange(teamId === value ? NO_TEAM : teamId);
    },
    [onChange, value]
  );
  const label = (
    <>
      Team <span className="font-regular text-muted">(optional)</span>
    </>
  );
  if (isPhone) {
    return (
      <fieldset className="flex flex-1 flex-col gap-2">
        <legend className="mb-2 font-semibold text-ink text-sm leading-[18px]">
          {label}
        </legend>
        <div className="flex flex-wrap gap-2">
          {teams.map(({ team }) => (
            <FilterChip
              className="px-[14px] py-[9px]"
              data-team-id={team.id}
              key={team.id}
              onClick={handleChip}
              selected={value === team.id}
            >
              {team.name}
            </FilterChip>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <Field className="flex-1">
      <Label htmlFor="invite-team">{label}</Label>
      <Select items={items} onValueChange={handleSelect} value={value}>
        <SelectTrigger className="px-4 py-[14px]" id="invite-team">
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

function InviteForm({
  academyId,
  defaultRole,
  onDone,
}: {
  academyId: Id;
  defaultRole: InvitableRole;
  onDone: () => void;
}) {
  const isPhone = useIsPhone();
  const teams = useQuery(teamListQueryOptions(academyId)).data ?? [];
  const owner = useQuery(platformOwnerQueryOptions()).data;
  const statusFor = useEmailStatus(academyId);
  const invite = useInviteMembers();
  const [draft, setDraft] = useState("");

  const sendable = useCallback(
    (emails: string[]) =>
      [...emails, ...splitEmails(draft, emails)].filter(
        (email) => statusFor(email) === "ok"
      ),
    [draft, statusFor]
  );

  const form = useForm({
    defaultValues: {
      emails: [] as string[],
      role: defaultRole,
      teamId: NO_TEAM,
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      const toSend = sendable(value.emails);
      if (toSend.length === 0) {
        return;
      }
      try {
        await invite.mutateAsync({
          academyId,
          emails: toSend,
          role: value.role,
          teamId: value.teamId === NO_TEAM ? null : value.teamId,
        });
      } catch (error) {
        toast.error(
          errorMessage(error, "Couldn’t send the invites. Try again.")
        );
        return;
      }
      toast.success(
        `${toSend.length} ${inviteWord(toSend.length)} sent. Each link works for 48 hours.`
      );
      onDone();
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
      <DialogBody className="gap-[18px]">
        <form.Field name="emails">
          {(field) => {
            const showError =
              field.state.meta.isTouched &&
              field.state.value.length > 0 &&
              sendable(field.state.value).length === 0;
            return (
              <Field>
                <Label htmlFor={EMAILS_INPUT_ID}>Emails</Label>
                <EmailChipsInput
                  describedBy={showError ? "invite-emails-error" : undefined}
                  draft={draft}
                  emails={field.state.value}
                  id={EMAILS_INPUT_ID}
                  invalid={showError}
                  onDraftChange={setDraft}
                  onEmailsChange={field.handleChange}
                  placeholder={isPhone ? "Add another…" : "Paste or type more…"}
                  statusFor={statusFor}
                />
                {showError ? (
                  <FieldMessage id="invite-emails-error" tone="error">
                    None of these can be invited. Add an email that isn’t
                    already in the academy.
                  </FieldMessage>
                ) : null}
              </Field>
            );
          }}
        </form.Field>
        <div className="flex gap-3 max-md:flex-col max-md:gap-[18px]">
          <form.Field name="role">
            {(field) => (
              <RoleField
                isPhone={isPhone}
                onChange={field.handleChange}
                ownerName={owner?.name ?? null}
                value={field.state.value}
              />
            )}
          </form.Field>
          <form.Field name="teamId">
            {(field) => (
              <TeamField
                isPhone={isPhone}
                onChange={field.handleChange}
                teams={teams}
                value={field.state.value}
              />
            )}
          </form.Field>
        </div>
      </DialogBody>
      <form.Subscribe selector={selectEmails}>
        {(emails) => {
          const count = sendable(emails).length;
          let label = "Send invites";
          if (invite.isPending) {
            label = "Sending…";
          } else if (count > 0) {
            label = `Send ${count} ${inviteWord(count)}`;
          }
          return (
            <DialogFooter>
              <DialogFooterNote>
                <span className="max-md:hidden">
                  {count} {inviteWord(count)} will be sent
                </span>
                <span className="md:hidden">Each link works for 48 hours.</span>
              </DialogFooterNote>
              <DialogClose
                render={<Button className="max-md:hidden" variant="ghost" />}
              >
                Cancel
              </DialogClose>
              <Button
                className="px-[22px]"
                disabled={count === 0 || invite.isPending}
                type="submit"
              >
                {label}
              </Button>
            </DialogFooter>
          );
        }}
      </form.Subscribe>
    </form>
  );
}

/**
 * "Invite people" (desktop 2HB-0 modal, phone 5U1-0 full-screen page), story AO-2.
 * Each email gets its own invitation. Open state lives in the URL (`?invite=1`).
 */
export function InviteDialog({
  academyId,
  open,
  defaultRole,
  onOpenChange,
}: {
  academyId: Id;
  open: boolean;
  defaultRole: InvitableRole;
  onOpenChange: (open: boolean) => void;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent initialFocus={focusEmailsInput} mobile="fullscreen">
        <DialogHeader>
          <DialogTitle>Invite people</DialogTitle>
          <DialogDescription>
            Each email gets its own invite link. Links expire after 48 hours.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <QueryBoundary className={DIALOG_ERROR_CLASS} what="the invite form">
            <InviteForm
              academyId={academyId}
              defaultRole={defaultRole}
              onDone={close}
            />
          </QueryBoundary>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
