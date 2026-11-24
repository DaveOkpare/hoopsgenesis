import { Button } from "@hoops-genesis/ui/components/button";
import { FilterChip } from "@hoops-genesis/ui/components/chip";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@hoops-genesis/ui/components/dialog";
import { Input } from "@hoops-genesis/ui/components/input";
import {
  FieldMessage,
  Label,
  LabelHint,
} from "@hoops-genesis/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hoops-genesis/ui/components/select";
import {
  type ChangeEvent,
  type MouseEvent,
  useCallback,
  useId,
  useState,
} from "react";
import { toast } from "sonner";

import { shortDate, timesLabel } from "@/features/events/model";
import {
  type EventDetail,
  type EventSessionItem,
  eventErrorMessage,
  useCancelEventDay,
} from "@/features/events/queries";
import type { DateOnly, Id } from "@/features/types";

const REASONS = ["Rain", "Holiday", "Court not available", "Other"] as const;
type Reason = (typeof REASONS)[number];

/**
 * "Cancel a day" from the event page (CO-6): one date of the event or its series.
 * POST /events/:id/sessions/:date/cancel. The server keeps the reason in the activity
 * log only, and sends no notification, so the copy promises neither.
 */
export function CancelDayDialog({
  academyId,
  detail,
  cancellable,
  date,
  open,
  onClose,
}: {
  academyId: Id;
  detail: EventDetail;
  cancellable: EventSessionItem[];
  date?: DateOnly;
  open: boolean;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<DateOnly | null>(null);
  const [reason, setReason] = useState<Reason>("Rain");
  const [other, setOther] = useState("");
  const [showError, setShowError] = useState(false);
  const cancel = useCancelEventDay(academyId);
  const { mutate, isPending } = cancel;
  const dateId = useId();
  const otherId = useId();

  const chosenDate = picked ?? date ?? cancellable[0]?.date ?? null;
  const session = cancellable.find((s) => s.date === chosenDate) ?? null;
  const reasonText = reason === "Other" ? other.trim() : reason;
  const items = cancellable.map((s) => ({
    value: s.date,
    label: `${shortDate(s.date)} · ${timesLabel(s.startTime, s.endTime)}`,
  }));

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        onClose();
      }
    },
    [onClose]
  );
  const handleDate = useCallback((value: string | null) => {
    if (value) {
      setPicked(value);
    }
  }, []);
  const handleReason = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    setReason(event.currentTarget.dataset.reason as Reason);
    setShowError(false);
  }, []);
  const handleOther = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setOther(event.target.value),
    []
  );
  const handleSubmit = useCallback(() => {
    if (!session) {
      return;
    }
    if (!reasonText) {
      setShowError(true);
      return;
    }
    mutate(
      { eventId: session.eventId, date: session.date, reason: reasonText },
      {
        onSuccess: () => {
          toast.success(`${shortDate(session.date)} cancelled`);
          setPicked(null);
          onClose();
        },
        onError: (error) =>
          toast.error(
            eventErrorMessage(error, "Could not cancel that day. Try again.")
          ),
      }
    );
  }, [mutate, onClose, reasonText, session]);

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="md:max-w-[480px]">
        <DialogHeader className="max-md:pt-5">
          <DialogTitle>Cancel a day?</DialogTitle>
          <DialogDescription className="leading-5">
            {detail.event.title}
            {detail.team ? ` · ${detail.team.name}` : ""}. It shows struck
            through on the calendar.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="gap-5 pt-5 max-md:pt-5">
          {cancellable.length === 0 ? (
            <p className="rounded-[14px] bg-fog px-[14px] py-3 text-ink-soft text-sm leading-[19px]">
              There are no dates left to cancel.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <Label id={`${dateId}-label`}>Day</Label>
              <Select
                items={items}
                onValueChange={handleDate}
                value={chosenDate}
              >
                <SelectTrigger aria-labelledby={`${dateId}-label`}>
                  <SelectValue placeholder="Choose a day" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <fieldset className="flex flex-col gap-[10px]">
            <legend className="mb-[10px] font-semibold text-ink text-sm leading-[18px]">
              Reason <LabelHint>(saved in the activity log)</LabelHint>
            </legend>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <FilterChip
                  className="px-[14px]"
                  data-reason={r}
                  key={r}
                  onClick={handleReason}
                  selected={reason === r}
                >
                  {r}
                </FilterChip>
              ))}
            </div>
            {reason === "Other" ? (
              <>
                <label className="sr-only" htmlFor={otherId}>
                  Reason
                </label>
                <Input
                  aria-invalid={showError ? true : undefined}
                  id={otherId}
                  maxLength={120}
                  onChange={handleOther}
                  placeholder="e.g. Coach away at a tournament"
                  value={other}
                />
                {showError ? (
                  <FieldMessage tone="error">
                    Say why the day is off.
                  </FieldMessage>
                ) : null}
              </>
            ) : null}
          </fieldset>
          <p className="rounded-[14px] bg-fog px-[14px] py-3 text-ink-soft text-sm leading-[19px]">
            Nobody is notified automatically. Tell students yourself if they
            need to know.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose} variant="ghost">
            Keep it
          </Button>
          <Button
            disabled={isPending || !session}
            onClick={handleSubmit}
            variant="destructive"
          >
            Cancel day
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
