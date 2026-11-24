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
import { Input } from "@hoops-genesis/ui/components/input";
import {
  FieldMessage,
  Label,
  LabelHint,
} from "@hoops-genesis/ui/components/label";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@hoops-genesis/ui/components/toggle-group";
import { type ChangeEvent, useCallback, useId, useState } from "react";
import { toast } from "sonner";

import { StudentFace } from "@/features/sessions/components/roster";
import { reviewLine, sessionErrorMessage } from "@/features/sessions/model";
import {
  asOfKey,
  type Session,
  type SessionEntry,
  useChangeAttendance,
  useRecordAttendance,
} from "@/features/sessions/queries";
import { zonedInstant } from "@/features/sessions/time";
import type { AttendanceStatus, Id } from "@/features/types";

const STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "excused", label: "Excused" },
  { value: "absent", label: "Absent" },
];

/**
 * Mark or change one student's attendance after the fact (CO-5 "Change", the ··· menu).
 * Unmarked: records the status (coach of the team or admin). Already marked: academy
 * admins only, because the server only lets admins void a row; it voids the row with a
 * reason and records the new status.
 */
export function ChangeDialog({
  session,
  entry,
  academyId,
  viewerId,
  now,
  onClose,
}: {
  session: Session;
  entry: SessionEntry | null;
  academyId: Id;
  viewerId: Id;
  now: Date;
  onClose: () => void;
}) {
  const open = Boolean(entry);
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        onClose();
      }
    },
    [onClose]
  );
  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="md:max-w-[460px]">
        {entry ? (
          <ChangeForm
            academyId={academyId}
            entry={entry}
            key={entry.student.id}
            now={now}
            onClose={onClose}
            session={session}
            viewerId={viewerId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ChangeForm({
  session,
  entry,
  academyId,
  viewerId,
  now,
  onClose,
}: {
  session: Session;
  entry: SessionEntry;
  academyId: Id;
  viewerId: Id;
  now: Date;
  onClose: () => void;
}) {
  const row = entry.attendance;
  const [status, setStatus] = useState<AttendanceStatus>(
    row?.status ?? "absent"
  );
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [showError, setShowError] = useState(false);
  const record = useRecordAttendance(academyId);
  const change = useChangeAttendance(academyId);
  const pending = record.isPending || change.isPending;
  const noteId = useId();
  const reasonId = useId();

  const handleStatus = useCallback((values: string[]) => {
    const next = STATUSES.find((s) => s.value === values[0]);
    if (next) {
      setStatus(next.value);
    }
  }, []);
  const handleNote = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setNote(event.target.value),
    []
  );
  const handleReason = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setReason(event.target.value);
    setShowError(false);
  }, []);

  const handleSave = useCallback(() => {
    const asOf = asOfKey(now);
    const arrived = status === "present" || status === "late";
    // Keep a real check-in time; otherwise use the session start (never in the future).
    const start = session.event.startTime
      ? zonedInstant(
          session.sessionDate,
          session.event.startTime,
          session.timeZone
        )
      : null;
    let checkInAt: string | undefined;
    if (arrived) {
      checkInAt =
        row?.checkInAt ??
        (start && start < now ? start.toISOString() : undefined);
    }
    const entryInput = {
      studentId: entry.student.id,
      status,
      checkInAt,
      notes: note.trim() || undefined,
    };
    const done = {
      onSuccess: () => {
        toast.success(`${entry.student.name} marked ${status}`);
        onClose();
      },
      onError: (error: unknown) => toast.error(sessionErrorMessage(error)),
    };
    if (!row) {
      record.mutate(
        {
          eventId: session.event.id,
          sessionDate: session.sessionDate,
          asOf,
          entries: [entryInput],
        },
        done
      );
      return;
    }
    if (!reason.trim()) {
      setShowError(true);
      return;
    }
    change.mutate(
      {
        rowId: row.id,
        reason: reason.trim(),
        eventId: session.event.id,
        sessionDate: session.sessionDate,
        asOf,
        entry: entryInput,
      },
      done
    );
  }, [change, entry, note, now, onClose, reason, record, row, session, status]);

  const unchanged = row?.status === status && !note.trim();
  return (
    <>
      <DialogHeader className="max-md:pt-[18px]">
        <div className="flex items-center gap-3">
          <StudentFace entry={entry} muted size={52} />
          <div className="flex min-w-0 flex-col">
            <DialogTitle className="font-sans font-semibold text-lg normal-case leading-[22px] max-md:text-lg max-md:leading-[22px]">
              {entry.student.name}
            </DialogTitle>
            <DialogDescription className="text-sm leading-[18px] max-md:leading-[18px]">
              {reviewLine(entry, session, viewerId)}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <DialogBody className="gap-5 pt-5 max-md:pt-5">
        <div className="flex flex-col gap-2">
          <Label id={`${noteId}-status`}>{row ? "Change to" : "Mark as"}</Label>
          <ToggleGroup
            aria-labelledby={`${noteId}-status`}
            onValueChange={handleStatus}
            value={[status]}
          >
            {STATUSES.map((s) => (
              <ToggleGroupItem key={s.value} value={s.value}>
                {s.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={noteId}>
            Note <LabelHint>(optional)</LabelHint>
          </Label>
          <Input
            id={noteId}
            maxLength={200}
            onChange={handleNote}
            placeholder="e.g. Told the coach ahead"
            value={note}
          />
        </div>
        {row ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={reasonId}>
              Why the change <LabelHint>(saved in the activity log)</LabelHint>
            </Label>
            <Input
              aria-invalid={showError ? true : undefined}
              id={reasonId}
              maxLength={200}
              onChange={handleReason}
              placeholder="e.g. Scanned the wrong session"
              value={reason}
            />
            {showError ? (
              <FieldMessage tone="error">
                Say why you're changing it.
              </FieldMessage>
            ) : null}
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose} variant="ghost">
          Cancel
        </Button>
        <Button disabled={pending || unchanged} onClick={handleSave}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
