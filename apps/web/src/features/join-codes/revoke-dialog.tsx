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
import { useForm } from "@tanstack/react-form";
import { type FormEvent, useCallback } from "react";
import { toast } from "sonner";
import z from "zod";

import { FormTextField } from "@/components/form-text-field";
import {
  type InvitationCode,
  joinCodeErrorCode,
  useRevokeJoinCode,
} from "@/features/join-codes/queries";
import type { Id } from "@/features/types";
import { errorMessage } from "@/lib/api-client";

const MAX_REASON = 500;

const schema = z.object({
  reason: z.string().trim().max(MAX_REASON, "Keep it under 500 characters"),
});

function peopleWord(count: number): string {
  return count === 1
    ? "person who already joined stays"
    : "people who already joined stay";
}

function RevokeForm({
  academyId,
  code,
  onDone,
}: {
  academyId: Id;
  code: InvitationCode;
  onDone: () => void;
}) {
  const revoke = useRevokeJoinCode();
  const form = useForm({
    defaultValues: { reason: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      try {
        await revoke.mutateAsync({
          academyId,
          id: code.id,
          reason: value.reason.trim() || undefined,
        });
        toast.success(`${code.code} is turned off.`);
        onDone();
      } catch (error) {
        toast.error(
          joinCodeErrorCode(error) === "already_revoked"
            ? "This code was already revoked."
            : errorMessage(error, "Couldn't revoke the code. Try again.")
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
      <DialogBody>
        <form.Field name="reason">
          {(field) => (
            <FormTextField
              autoComplete="off"
              field={field}
              label="Why (optional)"
              placeholder="e.g. posted in a public group"
            />
          )}
        </form.Field>
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Keep it</DialogClose>
        <Button disabled={revoke.isPending} type="submit" variant="destructive">
          {revoke.isPending ? "Revoking…" : "Revoke code"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Confirm before revoking (final). Not drawn in Paper; the spec says "Revoking stops new joins; people already in stay". */
export function RevokeDialog({
  academyId,
  code,
  onOpenChange,
  open,
}: {
  academyId: Id;
  code: InvitationCode | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  return (
    <Dialog onOpenChange={onOpenChange} open={open && code !== null}>
      <DialogContent>
        {code ? (
          <>
            <DialogHeader>
              <DialogTitle>Revoke {code.code}?</DialogTitle>
              <DialogDescription>
                Nobody new can join with it, and it can't be turned back on. The{" "}
                {code.useCount} {peopleWord(code.useCount)}.
              </DialogDescription>
            </DialogHeader>
            <RevokeForm academyId={academyId} code={code} onDone={close} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
