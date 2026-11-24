import { Button } from "@hoops-genesis/ui/components/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@hoops-genesis/ui/components/dialog";
import { useCallback } from "react";
import { toast } from "sonner";

import {
  type EventDetail,
  eventErrorMessage,
  useDeleteUpcoming,
} from "@/features/events/queries";
import type { DateOnly, Id } from "@/features/types";

/**
 * "Delete event" (CO-6): removes every date still to come. Past sessions and their
 * attendance stay (the server refuses to delete an event with attendance, so those
 * events have their remaining days cancelled instead).
 */
export function DeleteEventDialog({
  academyId,
  detail,
  today,
  open,
  onClose,
  onDeleted,
}: {
  academyId: Id;
  detail: EventDetail;
  today: DateOnly;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const remove = useDeleteUpcoming(academyId);
  const { mutate, isPending } = remove;
  const upcoming = detail.sessions.filter(
    (s) => s.date >= today && !s.cancelled
  );
  const hasPast = detail.sessions.some((s) => s.date < today && !s.cancelled);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        onClose();
      }
    },
    [onClose]
  );
  const handleDelete = useCallback(() => {
    mutate(
      { sessions: detail.sessions, today },
      {
        onSuccess: ({ kept }) => {
          if (kept > 0) {
            toast.success(
              `Deleted. ${kept} ${kept === 1 ? "day" : "days"} with check-ins stayed.`
            );
          } else {
            toast.success("Event deleted");
          }
          onDeleted();
        },
        onError: (error) =>
          toast.error(
            eventErrorMessage(error, "Could not delete the event. Try again.")
          ),
      }
    );
  }, [detail.sessions, mutate, onDeleted, today]);

  const count = upcoming.length;
  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="md:max-w-[460px]">
        <DialogHeader className="max-md:pt-5">
          <DialogTitle>Delete this event?</DialogTitle>
          <DialogDescription className="leading-5">
            {detail.event.title}
            {detail.team ? ` · ${detail.team.name}` : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="gap-4 pt-5 max-md:pt-5">
          <p className="text-[15px] text-ink leading-[22px]">
            {count === 0
              ? "There are no dates left to remove."
              : `Removes the ${count} ${count === 1 ? "date" : "dates"} still to come.`}
            {hasPast
              ? " Past sessions and their attendance stay in the records."
              : ""}
          </p>
          <p className="rounded-[14px] bg-fog px-[14px] py-3 text-ink-soft text-sm leading-[19px]">
            A day where students have already checked in can't be removed.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose} variant="ghost">
            Keep it
          </Button>
          <Button
            disabled={isPending || count === 0}
            onClick={handleDelete}
            variant="destructive"
          >
            Delete event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
