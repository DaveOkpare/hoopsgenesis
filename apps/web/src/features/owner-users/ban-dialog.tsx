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
import { Textarea } from "@hoops-genesis/ui/components/textarea";
import { type AnyFieldApi, useForm } from "@tanstack/react-form";
import { type ChangeEvent, type FormEvent, useCallback } from "react";
import { toast } from "sonner";
import z from "zod";
import { useIsOffline } from "@/components/offline";

import {
  type PlatformUser,
  useBanUser,
  useUnbanUser,
} from "@/features/owner-users/queries";
import { errorMessage } from "@/lib/api-client";
import { firstName } from "@/lib/format";

const MIN_REASON = 3;

const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(MIN_REASON, "Write a short reason. It is kept on the account."),
});

/** Unbanning takes no reason: Better Auth has nowhere to keep one. */
const unbanSchema = z.object({ reason: z.string() });

const selectSubmitting = (state: { isSubmitting: boolean }) =>
  state.isSubmitting;

function ReasonField({ field }: { field: AnyFieldApi }) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      field.handleChange(event.target.value),
    [field]
  );
  const error = field.state.meta.errors[0] as { message?: string } | undefined;
  return (
    <Field>
      <Label htmlFor="ban-reason">Reason</Label>
      <Textarea
        aria-describedby="ban-reason-hint"
        aria-invalid={error ? true : undefined}
        id="ban-reason"
        name={field.name}
        onBlur={field.handleBlur}
        onChange={handleChange}
        placeholder="e.g. Shared their account with another student"
        value={field.state.value as string}
      />
      {error?.message ? (
        <FieldMessage id="ban-reason-hint" tone="error">
          {error.message}
        </FieldMessage>
      ) : (
        <FieldMessage id="ban-reason-hint">
          Kept on the account as the ban reason and shown on their page. Bans
          are not written to the audit log.
        </FieldMessage>
      )}
    </Field>
  );
}

function BanForm({ user, onDone }: { user: PlatformUser; onDone: () => void }) {
  const ban = useBanUser();
  const unban = useUnbanUser();
  const offline = useIsOffline();
  const banning = !user.banned;
  const first = firstName(user.name);

  const form = useForm({
    defaultValues: { reason: "" },
    validators: { onSubmit: banning ? schema : unbanSchema },
    onSubmit: async ({ value }) => {
      const reason = value.reason.trim();
      try {
        if (banning) {
          await ban.mutateAsync({ userId: user.id, banReason: reason });
          toast.success(`${user.name} is banned`, {
            description: "They were signed out on every device.",
          });
        } else {
          await unban.mutateAsync({ userId: user.id });
          toast.success(`${user.name} can sign in again`);
        }
        onDone();
      } catch (error) {
        toast.error(errorMessage(error, "Couldn't save that. Try again."));
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
    <form className="flex min-h-0 flex-col" noValidate onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{banning ? "Ban account" : "Unban account"}</DialogTitle>
        <DialogDescription>
          {banning
            ? `${user.name} is signed out on every device and can't sign in until you unban the account.`
            : `${user.name} can sign in again with their usual email and password.`}
        </DialogDescription>
      </DialogHeader>
      {banning ? (
        <DialogBody>
          <form.Field name="reason">
            {(field) => <ReasonField field={field} />}
          </form.Field>
        </DialogBody>
      ) : null}
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <form.Subscribe selector={selectSubmitting}>
          {(isSubmitting) => (
            <Button
              disabled={isSubmitting || offline}
              type="submit"
              variant={banning ? "destructive" : "default"}
            >
              {banning ? `Ban ${first}` : `Unban ${first}`}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}

/**
 * Ban with a reason, or unban (PA-2). Opened by `?dialog=ban` on /owner/users and
 * /owner/users/$userId.
 */
export function BanDialog({
  user,
  open,
  onOpenChange,
}: {
  user: PlatformUser | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  return (
    <Dialog onOpenChange={onOpenChange} open={open && Boolean(user)}>
      <DialogContent>
        {user ? <BanForm onDone={close} user={user} /> : null}
      </DialogContent>
    </Dialog>
  );
}
