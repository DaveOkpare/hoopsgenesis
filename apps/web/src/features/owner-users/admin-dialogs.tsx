import { Button } from "@hoops-genesis/ui/components/button";
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
import { Field, FieldMessage, Label } from "@hoops-genesis/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hoops-genesis/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { DIALOG_ERROR_CLASS, ErrorState } from "@/components/error-state";
import { useIsOffline } from "@/components/offline";
import {
  platformAcademiesQueryOptions,
  useAppointAcademyAdmin,
  useRemoveAcademyAdmin,
} from "@/features/owner-academies/queries";
import type {
  PlatformUser,
  PlatformUserMembership,
} from "@/features/owner-users/queries";
import type { Id } from "@/features/types";
import { errorMessage, isApiError } from "@/lib/api-client";
import { firstName } from "@/lib/format";

/*
 * The owner's academy-admin actions on a person's page (EQE-0 "Make admin",
 * "Change", "Add to an academy"): POST and DELETE
 * /api/v1/admin/academies/:academyId/admins. Only the platform owner may appoint or
 * remove academy admins; adding someone as a coach or student is the academy
 * admin's job (an invitation or join code), so it is not offered here.
 */

function appointError(error: unknown): string {
  if (isApiError(error, "already_admin")) {
    return "They're already an admin there.";
  }
  if (isApiError(error, "platform_admin_cannot_be_member")) {
    return "Platform owners can't be academy members. Appoint someone else.";
  }
  return errorMessage(error, "Couldn't make them an admin. Try again.");
}

/** "Make admin" on a membership row. */
export function MakeAdminDialog({
  user,
  membership,
  open,
  onOpenChange,
}: {
  user: PlatformUser;
  membership: PlatformUserMembership | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const appoint = useAppointAcademyAdmin();
  const offline = useIsOffline();
  const first = firstName(user.name);
  const confirm = useCallback(() => {
    if (!membership) {
      return;
    }
    appoint.mutate(
      { academyId: membership.academyId, userId: user.id },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast.success(
            `${first} is now an admin of ${membership.academyName}`
          );
        },
        onError: (error) => toast.error(appointError(error)),
      }
    );
  }, [appoint, membership, user.id, first, onOpenChange]);
  return (
    <Dialog onOpenChange={onOpenChange} open={open && Boolean(membership)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make {first} an admin</DialogTitle>
          <DialogDescription>
            Of {membership?.academyName}. They keep the roles they have there.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-[15px] text-ink leading-body">
            Admins run the academy: members, teams, fees, records, join codes
            and the QR code. This is written to the audit log with your name.
          </p>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button disabled={appoint.isPending || offline} onClick={confirm}>
            {appoint.isPending ? "Saving…" : "Make admin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Change" on an admin's membership row: the owner can take the admin role away. */
export function RemoveAdminDialog({
  user,
  membership,
  open,
  onOpenChange,
}: {
  user: PlatformUser;
  membership: PlatformUserMembership | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useRemoveAcademyAdmin();
  const offline = useIsOffline();
  const first = firstName(user.name);
  const otherRoles = membership?.roles.filter((r) => r !== "admin") ?? [];
  const confirm = useCallback(() => {
    if (!membership) {
      return;
    }
    remove.mutate(
      { academyId: membership.academyId, userId: user.id },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast.success(
            `${first} is no longer an admin of ${membership.academyName}`
          );
        },
        onError: (error) =>
          toast.error(
            errorMessage(error, "Couldn't remove them as admin. Try again.")
          ),
      }
    );
  }, [remove, membership, user.id, first, onOpenChange]);
  return (
    <Dialog onOpenChange={onOpenChange} open={open && Boolean(membership)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change {first}’s role</DialogTitle>
          <DialogDescription>In {membership?.academyName}.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-[15px] text-ink leading-body">
            {otherRoles.length > 0
              ? `Removing ${first} as admin keeps them on as ${otherRoles.join(" and ")}.`
              : `${first} has no other role there, so removing them as admin takes them out of the academy and its teams.`}{" "}
            Only you can make someone an admin again. Switching between coach
            and student is done by the academy’s admins.
          </p>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button
            disabled={remove.isPending || offline}
            onClick={confirm}
            variant="destructive"
          >
            {remove.isPending ? "Removing…" : "Remove as admin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddToAcademyForm({
  user,
  onDone,
}: {
  user: PlatformUser;
  onDone: () => void;
}) {
  const academies = useQuery({
    ...platformAcademiesQueryOptions(),
    throwOnError: false,
  });
  const appoint = useAppointAcademyAdmin();
  const offline = useIsOffline();
  const [academyId, setAcademyId] = useState<Id | null>(null);
  const [missing, setMissing] = useState(false);
  const first = firstName(user.name);
  const adminOf = new Set(
    user.memberships
      .filter((m) => m.roles.includes("admin"))
      .map((m) => m.academyId)
  );
  const options = (academies.data ?? [])
    .filter((row) => !adminOf.has(row.academy.id))
    .map((row) => ({ value: row.academy.id, label: row.academy.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const handleChange = useCallback((value: unknown) => {
    setAcademyId(typeof value === "string" ? value : null);
    setMissing(false);
  }, []);
  const submit = useCallback(() => {
    if (!academyId) {
      setMissing(true);
      return;
    }
    const name = options.find((o) => o.value === academyId)?.label ?? "";
    appoint.mutate(
      { academyId, userId: user.id },
      {
        onSuccess: () => {
          onDone();
          toast.success(`${first} is now an admin of ${name}`);
        },
        onError: (error) => toast.error(appointError(error)),
      }
    );
  }, [academyId, appoint, user.id, first, onDone, options]);

  if (academies.isError && !academies.data) {
    return (
      <ErrorState
        className={DIALOG_ERROR_CLASS}
        error={academies.error}
        onRetry={academies.refetch}
        what="academies"
      />
    );
  }
  return (
    <>
      <DialogBody>
        <Field>
          <Label htmlFor="add-academy">Academy</Label>
          <Select
            items={options}
            onValueChange={handleChange}
            value={academyId}
          >
            <SelectTrigger
              aria-describedby="add-academy-hint"
              aria-invalid={missing ? true : undefined}
              id="add-academy"
            >
              <SelectValue placeholder="Choose an academy" />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldMessage
            id="add-academy-hint"
            tone={missing ? "error" : "muted"}
          >
            {missing
              ? "Choose the academy first."
              : "They join it as an admin straight away, or gain admin if they're already there."}
          </FieldMessage>
        </Field>
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button disabled={appoint.isPending || offline} onClick={submit}>
          {appoint.isPending ? "Saving…" : "Make admin"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** "Add to an academy": as its admin, the only role the owner can give. */
export function AddToAcademyDialog({
  user,
  open,
  onOpenChange,
}: {
  user: PlatformUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const first = firstName(user.name);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {first} to an academy</DialogTitle>
          <DialogDescription>
            As its admin. Coaches and students are added by the academy’s
            admins.
          </DialogDescription>
        </DialogHeader>
        {open ? <AddToAcademyForm onDone={close} user={user} /> : null}
      </DialogContent>
    </Dialog>
  );
}
