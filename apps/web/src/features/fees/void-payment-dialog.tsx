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
import {
  Field,
  FieldMessage,
  Label,
  LabelHint,
} from "@hoops-genesis/ui/components/label";
import { Textarea } from "@hoops-genesis/ui/components/textarea";
import { type AnyFieldApi, useForm } from "@tanstack/react-form";
import { type ChangeEvent, type FormEvent, useCallback } from "react";
import { toast } from "sonner";
import z from "zod";

import {
  methodLabel,
  periodKeyOf,
  periodShortLabel,
} from "@/features/fees/periods";
import { type PaymentRow, useVoidFee } from "@/features/fees/queries";
import type { Id } from "@/features/types";
import { firstName, formatDayMonth, formatMoney } from "@/lib/format";

const MIN_REASON = 3;
const MAX_REASON = 500;

const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(MIN_REASON, "Say why you're voiding it")
    .max(MAX_REASON, "Keep the reason under 500 characters"),
  confirmed: z.literal(true, "Tick the box to confirm"),
});

const BULLETS = [
  "It drops out of totals and the unpaid list.",
  "It stays in the list, struck through, with your name and reason.",
  "It’s written to the activity log.",
];

const selectCanVoid = (state: {
  values: { reason: string; confirmed: boolean };
  isSubmitting: boolean;
}) => ({
  ready:
    state.values.reason.trim().length >= MIN_REASON && state.values.confirmed,
  isSubmitting: state.isSubmitting,
});

function VoidIcon() {
  return (
    <div className="mb-3 flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-orange-soft max-md:hidden">
      <svg aria-hidden="true" height="22" viewBox="0 0 22 22" width="22">
        <circle
          cx="11"
          cy="11"
          fill="none"
          r="8.5"
          stroke="#B8501A"
          strokeWidth="1.8"
        />
        <path
          d="M5 17L17 5"
          fill="none"
          stroke="#B8501A"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    </div>
  );
}

function firstErrorMessage(field: AnyFieldApi): string | undefined {
  const error = field.state.meta.errors[0] as { message?: string } | undefined;
  return error?.message;
}

function ReasonField({ field }: { field: AnyFieldApi }) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      field.handleChange(event.target.value),
    [field]
  );
  const error = firstErrorMessage(field);
  return (
    <Field>
      <Label htmlFor="void-reason">
        Reason <LabelHint tone="required">required</LabelHint>
      </Label>
      <Textarea
        aria-describedby={error ? "void-reason-error" : undefined}
        aria-invalid={error ? true : undefined}
        className="px-[14px] py-3"
        id="void-reason"
        name={field.name}
        onBlur={field.handleBlur}
        onChange={handleChange}
        placeholder="What was wrong with this payment?"
        required
        value={field.state.value as string}
      />
      {error ? (
        <FieldMessage id="void-reason-error" tone="error">
          {error}
        </FieldMessage>
      ) : null}
    </Field>
  );
}

function ConfirmField({ field }: { field: AnyFieldApi }) {
  const handleChange = useCallback(
    (checked: boolean) => field.handleChange(checked),
    [field]
  );
  return (
    <div className="flex items-center gap-[10px]">
      <Checkbox
        checked={field.state.value as boolean}
        id="void-confirm"
        onCheckedChange={handleChange}
      />
      <label
        className="cursor-pointer text-ink text-sm leading-[18px]"
        htmlFor="void-confirm"
      >
        I understand this can’t be undone
      </label>
    </div>
  );
}

function recorderLabel(fee: PaymentRow, viewerId: Id): string {
  if (fee.recordedBy === viewerId) {
    return "recorded by you";
  }
  if (fee.recordedByName) {
    return `recorded by ${firstName(fee.recordedByName)}`;
  }
  return fee.paymentReference ? `ref ${fee.paymentReference}` : "paid online";
}

function VoidForm({
  fee,
  academyId,
  viewerId,
  timeZone,
  onDone,
}: {
  fee: PaymentRow;
  academyId: Id;
  viewerId: Id;
  timeZone: string;
  onDone: () => void;
}) {
  const voidFee = useVoidFee(academyId, viewerId);
  const form = useForm({
    defaultValues: { reason: "", confirmed: false },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      try {
        await voidFee.mutateAsync({
          feeId: fee.id,
          reason: value.reason.trim(),
        });
        toast.success("Payment voided", {
          description: `${fee.student.name}'s ${periodShortLabel(periodKeyOf(fee.periodStart))} payment no longer counts.`,
        });
        onDone();
      } catch {
        toast.error(
          "The payment couldn't be voided. It may already be voided."
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
  const paidOn = fee.paidAt ? formatDayMonth(fee.paidAt, timeZone) : "—";

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      noValidate
      onSubmit={handleSubmit}
    >
      <DialogHeader showCloseButton={false}>
        <VoidIcon />
        <DialogTitle className="md:text-[34px]">Void this payment?</DialogTitle>
        <DialogDescription className="leading-body max-md:leading-body">
          This can’t be undone. If the payment was right, record it again after
          voiding.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="gap-[18px] pt-[10px] max-md:pt-[10px]">
        <div className="flex items-center justify-between gap-4 rounded-[14px] bg-fog px-4 py-[14px]">
          <div className="flex min-w-0 flex-col">
            <p className="font-semibold text-[15px] text-ink leading-[18px]">
              {fee.student.name} ·{" "}
              {periodShortLabel(periodKeyOf(fee.periodStart))}
            </p>
            <p className="text-[13px] text-muted leading-4">
              {methodLabel(fee.paymentMethod)} · {paidOn} ·{" "}
              {recorderLabel(fee, viewerId)}
            </p>
          </div>
          <p className="shrink-0 font-semibold text-[15px] text-ink leading-[18px]">
            {formatMoney({ amount: fee.amount, currency: fee.currency })}
          </p>
        </div>
        <ul className="flex flex-col gap-2">
          {BULLETS.map((text) => (
            <li className="flex items-start gap-[10px]" key={text}>
              <span
                aria-hidden="true"
                className="mt-2 size-[6px] shrink-0 rounded-full bg-ink"
              />
              <span className="text-ink-soft text-sm leading-body">{text}</span>
            </li>
          ))}
        </ul>
        <form.Field name="reason">
          {(field) => <ReasonField field={field} />}
        </form.Field>
        <form.Field name="confirmed">
          {(field) => <ConfirmField field={field} />}
        </form.Field>
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <form.Subscribe selector={selectCanVoid}>
          {({ ready, isSubmitting }) => (
            <Button
              className="px-[22px]"
              disabled={!ready || isSubmitting}
              type="submit"
              variant="destructive"
            >
              {isSubmitting ? "Voiding…" : "Void payment"}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}

export function VoidPaymentDialog({
  fee,
  academyId,
  viewerId,
  timeZone,
  open,
  onOpenChange,
}: {
  fee: PaymentRow | undefined;
  academyId: Id;
  viewerId: Id;
  timeZone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const handleDone = useCallback(() => onOpenChange(false), [onOpenChange]);
  // Keep the form while the dialog animates closed after a successful void.
  const canVoid = fee && (fee.voidedAt === null || !open);
  return (
    <Dialog onOpenChange={onOpenChange} open={open && Boolean(fee)}>
      <DialogContent className="md:max-w-[500px]">
        {canVoid ? (
          <VoidForm
            academyId={academyId}
            fee={fee}
            key={fee.id}
            onDone={handleDone}
            timeZone={timeZone}
            viewerId={viewerId}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Already voided</DialogTitle>
              <DialogDescription>
                This payment was voided
                {fee?.voidedAt
                  ? ` on ${formatDayMonth(fee.voidedAt, timeZone)}`
                  : ""}
                . It stays in the list with its reason.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button />}>Close</DialogClose>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
