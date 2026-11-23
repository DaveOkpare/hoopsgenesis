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
import {
  Field,
  FieldMessage,
  Label,
  LabelHint,
} from "@hoops-genesis/ui/components/label";
import { Textarea } from "@hoops-genesis/ui/components/textarea";
import { type AnyFieldApi, useForm } from "@tanstack/react-form";
import { type ChangeEvent, type FormEvent, useCallback } from "react";
import z from "zod";

import { recordTitle } from "@/features/records/describe";
import type { ReviewItem } from "@/features/records/queries";
import { firstName } from "@/lib/format";

const MIN_NOTE = 3;
const MAX_NOTE = 500;

const schema = z.object({
  note: z
    .string()
    .trim()
    .min(MIN_NOTE, "Tell them what to fix")
    .max(MAX_NOTE, "Keep the note under 500 characters"),
});

const selectReady = (state: {
  values: { note: string };
  isSubmitting: boolean;
}) => ({
  ready: state.values.note.trim().length >= MIN_NOTE,
  isSubmitting: state.isSubmitting,
});

function NoteField({ field, name }: { field: AnyFieldApi; name: string }) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      field.handleChange(event.target.value),
    [field]
  );
  const error = (field.state.meta.errors[0] as { message?: string } | undefined)
    ?.message;
  return (
    <Field>
      <Label htmlFor="reject-note">
        Note for {name} <LabelHint tone="required">required</LabelHint>
      </Label>
      <Textarea
        aria-describedby={error ? "reject-note-error" : "reject-note-hint"}
        aria-invalid={error ? true : undefined}
        className="px-[14px] py-3"
        id="reject-note"
        name={field.name}
        onBlur={field.handleBlur}
        onChange={handleChange}
        placeholder="e.g. The average doesn't match the report card."
        required
        value={field.state.value as string}
      />
      {error ? (
        <FieldMessage id="reject-note-error" tone="error">
          {error}
        </FieldMessage>
      ) : (
        <FieldMessage id="reject-note-hint">
          {name} sees this note and can upload again.
        </FieldMessage>
      )}
    </Field>
  );
}

function RejectForm({
  item,
  onReject,
}: {
  item: ReviewItem;
  onReject: (note: string) => Promise<void>;
}) {
  const name = firstName(item.student.name);
  const form = useForm({
    defaultValues: { note: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      await onReject(value.note.trim());
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
      <DialogHeader>
        <DialogTitle>Reject this record?</DialogTitle>
        <DialogDescription>
          {item.student.name} · {recordTitle(item)}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <form.Field name="note">
          {(field) => <NoteField field={field} name={name} />}
        </form.Field>
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <form.Subscribe selector={selectReady}>
          {({ ready, isSubmitting }) => (
            <Button
              className="px-[22px]"
              disabled={!ready || isSubmitting}
              type="submit"
              variant="destructive"
            >
              {isSubmitting ? "Rejecting…" : "Reject record"}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}

export function RejectRecordDialog({
  item,
  open,
  onOpenChange,
  onReject,
}: {
  item: ReviewItem | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReject: (note: string) => Promise<void>;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open && Boolean(item)}>
      <DialogContent className="md:max-w-[500px]">
        {item ? (
          <RejectForm item={item} key={item.id} onReject={onReject} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
