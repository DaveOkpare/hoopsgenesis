/*
 * "Cancel this day" from the coach calendar (CO-6). POST
 * /events/:id/sessions/:date/cancel through features/sessions (useCancelSession),
 * which refreshes every query of the academy. Refused once a student has checked in
 * (409 attendance_exists).
 */
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
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import type { CalendarItem } from "@/features/calendar/api";
import { weekdayDayMonth } from "@/features/calendar/dates";
import { itemHeading, type TeamIndex } from "@/features/calendar/model";
import { useCancelSession } from "@/features/sessions/queries";
import type { Id } from "@/features/types";
import { errorMessage, isApiError } from "@/lib/api-client";

const MAX_REASON = 200;

function CancelForm({
  academyId,
  item,
  teams,
  onDone,
}: {
  academyId: Id;
  item: CalendarItem;
  teams: TeamIndex;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const cancel = useCancelSession(academyId);
  const handleReason = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => setReason(event.target.value),
    []
  );
  const heading = itemHeading(item, teams);
  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      try {
        await cancel.mutateAsync({
          eventId: item.eventId,
          sessionDate: item.sessionDate,
          reason: reason.trim(),
          scope: "day",
        });
        toast.success("Day cancelled", {
          description: `${heading} on ${weekdayDayMonth(item.sessionDate)} is struck through on the calendar.`,
        });
        onDone();
      } catch (error) {
        if (isApiError(error, "attendance_exists")) {
          toast.error(
            "A student has already checked in, so this day can't be cancelled."
          );
          return;
        }
        if (isApiError(error, "already_cancelled")) {
          toast.error("This day is already cancelled.");
          onDone();
          return;
        }
        toast.error(
          errorMessage(error, "The day couldn't be cancelled. Try again.")
        );
      }
    },
    [cancel, heading, item, onDone, reason]
  );
  const tooLong = reason.trim().length > MAX_REASON;
  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Cancel this day?</DialogTitle>
        <DialogDescription>
          {heading} on {weekdayDayMonth(item.sessionDate)}. The other days of
          the series stay as they are.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <Field>
          <Label htmlFor="cancel-reason">Reason (optional)</Label>
          <Textarea
            aria-describedby={tooLong ? "cancel-reason-error" : undefined}
            aria-invalid={tooLong}
            id="cancel-reason"
            onChange={handleReason}
            placeholder="Rain, pitch flooded"
            value={reason}
          />
          {tooLong ? (
            <FieldMessage id="cancel-reason-error" tone="error">
              Keep it under {MAX_REASON} characters.
            </FieldMessage>
          ) : null}
        </Field>
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Keep it</DialogClose>
        <Button
          disabled={cancel.isPending || tooLong}
          type="submit"
          variant="destructive"
        >
          {cancel.isPending ? "Cancelling…" : "Cancel this day"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CancelDayDialog({
  academyId,
  item,
  teams,
  onClose,
}: {
  academyId: Id;
  item: CalendarItem | undefined;
  teams: TeamIndex;
  onClose: () => void;
}) {
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );
  return (
    <Dialog onOpenChange={handleOpenChange} open={Boolean(item)}>
      <DialogContent className="md:max-w-[480px]">
        {item ? (
          <CancelForm
            academyId={academyId}
            item={item}
            key={item.key}
            onDone={onClose}
            teams={teams}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
