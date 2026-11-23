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

import {
  type PlatformUser,
  useBanUser,
  useUnbanUser,
} from "@/features/owner-users/queries";
import { firstName } from "@/lib/format";

const MIN_REASON = 3;

const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(MIN_REASON, "Write a short reason. It goes in the audit log."),
});

const selectSubmitting = (state: { isSubmitting: boolean }) =>
  state.isSubmitting;

function ReasonField({
  field,
  banning,
}: {
  field: AnyFieldApi;
  banning: boolean;
}) {
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
        placeholder={
          banning
            ? "e.g. Shared their account with another student"
            : "e.g. Confirmed with the academy admin"
        }
        value={field.state.value as string}
      />
      {error?.message ? (
        <FieldMessage id="ban-reason-hint" tone="error">
          {error.message}
        </FieldMessage>
      ) : (
        <FieldMessage id="ban-reason-hint">
          Saved to the platform audit log with your name.
        </FieldMessage>
      )}
    </Field>
  );
}

function BanForm({ user, onDone }: { user: PlatformUser; onDone: () => void }) {
  const ban = useBanUser();
  const unban = useUnbanUser();
  const banning = !user.banned;
  const first = firstName(user.name);

  const form = useForm({
    defaultValues: { reason: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      const reason = value.reason.trim();
      try {
        if (banning) {
          await ban.mutateAsync({ userId: user.id, banReason: reason });
          toast.success(`${user.name} is banned`, {
            description: "They were signed out on every device.",
          });
        } else {
          await unban.mutateAsync({ userId: user.id, reason });
          toast.success(`${user.name} can sign in again`);
        }
        onDone();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Something went wrong"
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
    <form className="flex min-h-0 flex-col" noValidate onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{banning ? "Ban account" : "Unban account"}</DialogTitle>
        <DialogDescription>
          {banning
            ? `${user.name} is signed out on every device and can't sign in until you unban the account.`
            : `${user.name} can sign in again with their usual email and password.`}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <form.Field name="reason">
          {(field) => <ReasonField banning={banning} field={field} />}
        </form.Field>
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <form.Subscribe selector={selectSubmitting}>
          {(isSubmitting) => (
            <Button
              disabled={isSubmitting}
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

/** Ban / unban with a reason (PA-2). Opened by `?dialog=ban` on /owner/users. */
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
