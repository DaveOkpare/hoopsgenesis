import { Button } from "@hoops-genesis/ui/components/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@hoops-genesis/ui/components/dialog";
import { Input } from "@hoops-genesis/ui/components/input";
import { Label, LabelHint } from "@hoops-genesis/ui/components/label";
import {
  type ChangeEvent,
  type MouseEvent,
  useCallback,
  useState,
} from "react";
import { toast } from "sonner";

import { TickIcon } from "@/components/coach/coach-icons";
import { StudentFace } from "@/features/sessions/components/roster";
import { sessionErrorMessage } from "@/features/sessions/model";
import {
  asOfKey,
  type Session,
  type SessionEntry,
  useRecordAttendance,
} from "@/features/sessions/queries";
import { localTime } from "@/features/sessions/time";
import type { AttendanceStatus, Id } from "@/features/types";

/**
 * "Check a student in by hand" (CO-4, 3WI-0). Bottom sheet on phones, centred dialog
 * on the web; both are allowed per the spec. Recorded as the coach.
 */
export function CheckInDialog({
  session,
  entry,
  academyId,
  now,
  onClose,
}: {
  session: Session;
  entry: SessionEntry | null;
  academyId: Id;
  now: Date;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const record = useRecordAttendance(academyId);
  const nowLabel = localTime(now, session.timeZone);

  const { mutate, isPending } = record;
  const handleStatus = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const status = event.currentTarget.dataset.status as AttendanceStatus;
      if (!entry) {
        return;
      }
      const asOf = asOfKey(now);
      mutate(
        {
          eventId: session.event.id,
          sessionDate: session.sessionDate,
          asOf,
          entries: [
            {
              studentId: entry.student.id,
              status,
              checkInAt: status === "excused" ? undefined : asOf,
              notes: note.trim() || undefined,
            },
          ],
        },
        {
          onSuccess: () => {
            const what = {
              present: `checked in at ${localTime(now, session.timeZone)}`,
              late: "checked in as late",
              excused: "marked as excused",
              absent: "marked absent",
            }[status];
            toast.success(`${entry.student.name} ${what}`);
            setNote("");
            onClose();
          },
          onError: (error) => toast.error(sessionErrorMessage(error)),
        }
      );
    },
    [entry, mutate, note, now, onClose, session]
  );

  const handleNote = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setNote(event.target.value),
    []
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <Dialog onOpenChange={handleOpenChange} open={Boolean(entry)}>
      <DialogContent className="md:max-w-[440px]">
        {entry ? (
          <>
            <DialogHeader className="max-md:pt-[18px]">
              <div className="flex items-center gap-3">
                <StudentFace entry={entry} muted size={52} />
                <div className="flex min-w-0 flex-col">
                  <DialogTitle className="font-sans font-semibold text-lg normal-case leading-[22px] max-md:text-lg max-md:leading-[22px]">
                    {entry.student.name}
                  </DialogTitle>
                  <DialogDescription className="text-sm leading-[18px] max-md:leading-[18px]">
                    {session.team?.name ?? session.event.title} · no scan yet
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <DialogBody className="gap-[18px] pt-[18px] pb-9 max-md:pt-[18px] max-md:pb-9">
              <Button
                className="w-full py-4 text-base leading-5"
                data-status="present"
                disabled={isPending}
                onClick={handleStatus}
              >
                <TickIcon />
                Check in now · {nowLabel}
              </Button>
              <div className="flex gap-2">
                <Button
                  className="flex-1 p-[14px]"
                  data-status="late"
                  disabled={isPending}
                  onClick={handleStatus}
                  variant="outline"
                >
                  Late
                </Button>
                <Button
                  className="flex-1 p-[14px]"
                  data-status="excused"
                  disabled={isPending}
                  onClick={handleStatus}
                  variant="outline"
                >
                  Excused
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="check-in-note">
                  Note <LabelHint>(optional)</LabelHint>
                </Label>
                <Input
                  id="check-in-note"
                  maxLength={200}
                  onChange={handleNote}
                  placeholder="e.g. Phone at home"
                  value={note}
                />
              </div>
              <p className="text-center text-[13px] text-muted leading-4">
                Shown as recorded by you
              </p>
            </DialogBody>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
