import { Button } from "@hoops-genesis/ui/components/button";
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
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, type MouseEvent, useCallback, useMemo } from "react";
import { toast } from "sonner";
import z from "zod";
import { ErrorState, failedQueries } from "@/components/error-state";
import {
  addMonths,
  isPeriodKey,
  methodLabel,
  PAYMENT_METHODS,
  type PeriodKey,
  periodDescription,
  periodEnd,
  periodMonthName,
  periodOf,
  periodStart,
  todayIn,
} from "@/features/fees/periods";
import {
  currentTime,
  defaultFeeQueryOptions,
  type FeeStudent,
  feeStudentsQueryOptions,
  feesQueryOptions,
  isDuplicatePayment,
  type PaymentRow,
  useRecordPayment,
} from "@/features/fees/queries";
import {
  AmountField,
  BigAmountField,
  DatePaidField,
  MethodField,
  PeriodField,
  ReferenceField,
  StudentCardField,
  StudentSelectField,
} from "@/features/fees/record-payment-fields";
import type { Id, PaymentMethod } from "@/features/types";
import { errorMessage } from "@/lib/api-client";
import { firstName, formatDayMonth, formatMoney } from "@/lib/format";
import { useIsPhone } from "@/lib/use-is-phone";

const DIGITS = /^\d+$/;
const MAX_REFERENCE = 60;

interface RecordValues {
  amount: string;
  method: PaymentMethod;
  paidOn: string;
  /** A PeriodKey ("2026-11"); typed as string so the zod schema fits the form. */
  period: string;
  reference: string;
  studentId: string;
}

function makeSchema(today: string) {
  return z.object({
    studentId: z.string().min(1, "Choose a student"),
    period: z.string().refine((value) => isPeriodKey(value), "Choose a period"),
    amount: z
      .string()
      .regex(DIGITS, "Enter the amount paid")
      .refine((value) => Number(value) > 0, "Enter the amount paid"),
    paidOn: z
      .string()
      .min(1, "Choose the date it was paid")
      .refine((value) => value <= today, "The date can't be in the future"),
    method: z.enum(PAYMENT_METHODS),
    reference: z
      .string()
      .max(MAX_REFERENCE, "Keep the reference under 60 characters"),
  });
}

const METHOD_PHRASE: Record<PaymentMethod, string> = {
  cash: "in cash",
  bank_transfer: "by bank transfer",
  mobile_money: "by mobile money",
};

function useRecordForm(
  defaults: RecordValues,
  today: string,
  onSubmit: (values: RecordValues) => Promise<void>
) {
  const schema = useMemo(() => makeSchema(today), [today]);
  return useForm({
    defaultValues: defaults,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    validators: { onSubmit: schema },
  });
}

type RecordForm = ReturnType<typeof useRecordForm>;

const selectDuplicateInputs = (state: { values: RecordValues }) => ({
  studentId: state.values.studentId,
  period: state.values.period as PeriodKey,
});

const selectSaveState = (state: {
  values: RecordValues;
  isSubmitting: boolean;
}) => ({
  amount: state.values.amount,
  method: state.values.method,
  period: state.values.period as PeriodKey,
  studentId: state.values.studentId,
  isSubmitting: state.isSubmitting,
});

function findDuplicate(
  payments: PaymentRow[],
  studentId: string,
  period: PeriodKey
): PaymentRow | undefined {
  return payments.find(
    (row) =>
      row.studentId === studentId &&
      row.periodStart === periodStart(period) &&
      row.paidAt !== null &&
      row.voidedAt === null
  );
}

function WarningIcon() {
  return (
    <svg
      aria-hidden="true"
      className="mt-px shrink-0"
      height="18"
      viewBox="0 0 18 18"
      width="18"
    >
      <path
        d="M9 2l7.5 13h-15z"
        fill="none"
        stroke="#B8501A"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M9 7v3.5M9 12.8v.1"
        fill="none"
        stroke="#B8501A"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

/** "Samuel already paid for November" with a link to the existing payment. */
function DuplicateNotice({
  duplicate,
  period,
  viewerId,
  timeZone,
  onViewPayment,
}: {
  duplicate: PaymentRow;
  period: PeriodKey;
  viewerId: Id;
  timeZone: string;
  onViewPayment: (feeId: Id, period: PeriodKey) => void;
}) {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      onViewPayment(duplicate.id, period);
    },
    [duplicate.id, onViewPayment, period]
  );
  let recorder = "";
  if (duplicate.recordedBy === viewerId) {
    recorder = ", recorded by you";
  } else if (duplicate.recordedByName) {
    recorder = `, recorded by ${firstName(duplicate.recordedByName)}`;
  }
  const how = duplicate.paymentMethod
    ? ` ${METHOD_PHRASE[duplicate.paymentMethod]}`
    : "";
  const on = duplicate.paidAt
    ? ` on ${formatDayMonth(duplicate.paidAt, timeZone)}`
    : "";
  return (
    <div
      className="flex gap-3 rounded-[14px] bg-orange-soft px-4 py-[14px]"
      role="alert"
    >
      <WarningIcon />
      <div className="flex flex-col gap-[2px]">
        <p className="font-semibold text-[15px] text-ink leading-[18px]">
          {firstName(duplicate.student.name)} already paid for{" "}
          {periodMonthName(period)}
        </p>
        <p className="text-ink-soft text-sm leading-[140%]">
          {formatMoney({
            amount: duplicate.amount,
            currency: duplicate.currency,
          })}
          {how}
          {on}
          {recorder}.{" "}
          <button
            className="cursor-pointer font-semibold text-ink underline decoration-1 underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ink"
            onClick={handleClick}
            type="button"
          >
            View payment
          </button>
        </p>
      </div>
    </div>
  );
}

interface LayoutProps {
  currency: string;
  form: RecordForm;
  now: Date;
  onViewPayment: (feeId: Id, period: PeriodKey) => void;
  payments: PaymentRow[];
  periods: PeriodKey[];
  students: FeeStudent[];
  timeZone: string;
  today: string;
  viewerId: Id;
}

function DuplicateSlot({
  form,
  payments,
  viewerId,
  timeZone,
  onViewPayment,
}: Pick<
  LayoutProps,
  "form" | "payments" | "viewerId" | "timeZone" | "onViewPayment"
>) {
  return (
    <form.Subscribe selector={selectDuplicateInputs}>
      {({ studentId, period }) => {
        const duplicate = findDuplicate(payments, studentId, period);
        return duplicate ? (
          <DuplicateNotice
            duplicate={duplicate}
            onViewPayment={onViewPayment}
            period={period}
            timeZone={timeZone}
            viewerId={viewerId}
          />
        ) : null;
      }}
    </form.Subscribe>
  );
}

function DesktopLayout(props: LayoutProps) {
  const { form, students, payments, periods, currency, today, now, timeZone } =
    props;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Record payment</DialogTitle>
        <DialogDescription>
          For cash or bank transfers paid outside the app.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <form.Field name="studentId">
          {(field) => <StudentSelectField field={field} students={students} />}
        </form.Field>
        <div className="flex gap-3">
          <form.Field name="period">
            {(field) => (
              <PeriodField field={field} periods={periods} variant="field" />
            )}
          </form.Field>
          <form.Field name="amount">
            {(field) => <AmountField currency={currency} field={field} />}
          </form.Field>
        </div>
        <DuplicateSlot {...props} />
        <div className="flex gap-3">
          <form.Field name="paidOn">
            {(field) => (
              <DatePaidField
                field={field}
                now={now}
                timeZone={timeZone}
                today={today}
                variant="field"
              />
            )}
          </form.Field>
          <form.Field name="reference">
            {(field) => <ReferenceField field={field} variant="field" />}
          </form.Field>
        </div>
        <form.Field name="method">
          {(field) => <MethodField field={field} variant="field" />}
        </form.Field>
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <form.Subscribe selector={selectSaveState}>
          {({ studentId, period, isSubmitting }) => (
            <Button
              className="px-[22px]"
              disabled={
                isSubmitting ||
                Boolean(findDuplicate(payments, studentId, period))
              }
              type="submit"
            >
              {isSubmitting ? "Saving…" : "Save payment"}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </>
  );
}

function PhoneLayout(props: LayoutProps) {
  const { form, students, payments, periods, currency, today, now, timeZone } =
    props;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Record payment</DialogTitle>
        <DialogDescription>
          For cash or bank transfers paid outside the app.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="gap-[18px]">
        <form.Field name="studentId">
          {(field) => (
            <StudentCardField
              field={field}
              students={students}
              timeZone={timeZone}
            />
          )}
        </form.Field>
        <form.Subscribe selector={selectDuplicateInputs}>
          {({ period }) => (
            <form.Field name="amount">
              {(field) => (
                <BigAmountField
                  currency={currency}
                  field={field}
                  period={period}
                />
              )}
            </form.Field>
          )}
        </form.Subscribe>
        <form.Field name="method">
          {(field) => <MethodField field={field} variant="row" />}
        </form.Field>
        <div className="flex flex-col rounded-md border border-line px-[14px]">
          <form.Field name="period">
            {(field) => (
              <PeriodField field={field} periods={periods} variant="row" />
            )}
          </form.Field>
          <form.Field name="paidOn">
            {(field) => (
              <DatePaidField
                field={field}
                now={now}
                timeZone={timeZone}
                today={today}
                variant="row"
              />
            )}
          </form.Field>
          <form.Field name="reference">
            {(field) => <ReferenceField field={field} variant="row" />}
          </form.Field>
        </div>
        <DuplicateSlot {...props} />
      </DialogBody>
      <DialogFooter>
        <form.Subscribe selector={selectSaveState}>
          {({ amount, method, studentId, period, isSubmitting }) => (
            <Button
              disabled={
                isSubmitting ||
                Boolean(findDuplicate(payments, studentId, period))
              }
              type="submit"
            >
              {isSubmitting
                ? "Saving…"
                : `Save · ${formatMoney({ amount: amount || "0", currency })} ${methodLabel(method).toLowerCase()}`}
            </Button>
          )}
        </form.Subscribe>
        <DialogFooterNote>
          Saved payments can only be voided from the web, with a reason.
        </DialogFooterNote>
      </DialogFooter>
    </>
  );
}

function RecordPaymentForm({
  academyId,
  timeZone,
  viewerId,
  students,
  payments,
  currency,
  defaultAmount,
  initialStudentId,
  onDone,
  onViewPayment,
}: {
  academyId: Id;
  timeZone: string;
  viewerId: Id;
  students: FeeStudent[];
  payments: PaymentRow[];
  currency: string;
  defaultAmount: string;
  initialStudentId: Id | undefined;
  onDone: () => void;
  onViewPayment: (feeId: Id, period: PeriodKey) => void;
}) {
  const isPhone = useIsPhone();
  const now = currentTime();
  const today = todayIn(now, timeZone);
  const thisPeriod = periodOf(now, timeZone);
  const periods = useMemo(
    () => [-2, -1, 0, 1].map((offset) => addMonths(thisPeriod, offset)),
    [thisPeriod]
  );
  const recordPayment = useRecordPayment(academyId);

  const handleSave = useCallback(
    async (values: RecordValues) => {
      const student = students.find((s) => s.id === values.studentId);
      const period = values.period as PeriodKey;
      const paidAt =
        values.paidOn === today
          ? currentTime().toISOString()
          : `${values.paidOn}T12:00:00Z`;
      try {
        await recordPayment.mutateAsync({
          studentId: values.studentId,
          description: periodDescription(period),
          periodStart: periodStart(period),
          periodEnd: periodEnd(period),
          amount: values.amount,
          currency,
          paidAt,
          paymentMethod: values.method,
          paymentReference: values.reference.trim() || null,
        });
        toast.success("Payment recorded", {
          description: `${formatMoney({ amount: values.amount, currency })} from ${student?.name ?? "the student"} for ${periodMonthName(period)}.`,
        });
        onDone();
      } catch (error) {
        if (isDuplicatePayment(error)) {
          // The fee lists refresh, so the "already paid" notice appears above.
          toast.error("This student already paid for that period.");
          return;
        }
        toast.error(
          errorMessage(error, "The payment couldn't be saved. Try again.")
        );
      }
    },
    [currency, onDone, recordPayment, students, today]
  );

  const form = useRecordForm(
    {
      studentId: initialStudentId ?? "",
      period: thisPeriod,
      // Empty when the academy has no payments yet to take a usual fee from.
      amount: defaultAmount ? String(Math.round(Number(defaultAmount))) : "",
      paidOn: today,
      method: "cash",
      reference: "",
    },
    today,
    handleSave
  );

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      event.stopPropagation();
      form.handleSubmit();
    },
    [form]
  );

  const layoutProps: LayoutProps = {
    form,
    students,
    payments,
    periods,
    currency,
    today,
    now,
    timeZone,
    viewerId,
    onViewPayment,
  };

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      noValidate
      onSubmit={handleSubmit}
    >
      {isPhone ? (
        <PhoneLayout {...layoutProps} />
      ) : (
        <DesktopLayout {...layoutProps} />
      )}
    </form>
  );
}

/** Skeletons while the form's data loads, or the error with "Try again". */
function LoadingBody({ failed }: { failed: ReturnType<typeof failedQueries> }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Record payment</DialogTitle>
        <DialogDescription>
          For cash or bank transfers paid outside the app.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        {failed ? (
          <ErrorState
            error={failed.error}
            onRetry={failed.retry}
            what="the payment form"
          />
        ) : (
          <>
            <Skeleton className="h-[52px] rounded-[14px]" />
            <Skeleton className="h-[46px] rounded-[14px]" />
            <Skeleton className="h-[46px] rounded-[14px]" />
            <Skeleton className="h-[46px] rounded-full" />
          </>
        )}
      </DialogBody>
    </>
  );
}

export function RecordPaymentDialog({
  academyId,
  timeZone,
  viewerId,
  open,
  initialStudentId,
  onOpenChange,
  onViewPayment,
}: {
  academyId: Id;
  timeZone: string;
  viewerId: Id;
  open: boolean;
  initialStudentId: Id | undefined;
  onOpenChange: (open: boolean) => void;
  onViewPayment: (feeId: Id, period: PeriodKey) => void;
}) {
  // A failure shows inside the dialog, not over the Fees page behind it.
  const students = useQuery({
    ...feeStudentsQueryOptions(academyId),
    enabled: open,
    throwOnError: false,
  });
  const payments = useQuery({
    ...feesQueryOptions(academyId, null),
    enabled: open,
    throwOnError: false,
  });
  const defaultFee = useQuery({
    ...defaultFeeQueryOptions(academyId),
    enabled: open,
    throwOnError: false,
  });
  const handleDone = useCallback(() => onOpenChange(false), [onOpenChange]);
  const ready = students.data && payments.data && defaultFee.data;
  const failed = failedQueries(students, payments, defaultFee);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="md:max-w-[540px]" mobile="fullscreen">
        {ready ? (
          <RecordPaymentForm
            academyId={academyId}
            currency={defaultFee.data.currency}
            defaultAmount={defaultFee.data.amount}
            initialStudentId={initialStudentId}
            key={initialStudentId ?? "new"}
            onDone={handleDone}
            onViewPayment={onViewPayment}
            payments={payments.data}
            students={students.data}
            timeZone={timeZone}
            viewerId={viewerId}
          />
        ) : (
          <LoadingBody failed={failed} />
        )}
      </DialogContent>
    </Dialog>
  );
}
