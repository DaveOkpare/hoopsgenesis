import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@hoops-genesis/ui/components/dialog";
import { useCallback } from "react";
import { toast } from "sonner";

import {
  type EventFormValues,
  NewEventForm,
} from "@/features/events/components/new-event-form";
import {
  type EventChanges,
  type EventDetail,
  type EventSessionItem,
  eventErrorMessage,
  useUpdateEvents,
} from "@/features/events/queries";
import type { DateOnly, Id } from "@/features/types";
import type { Membership } from "@/features/viewer/api";

const SCHEDULE_FIELDS = [
  "startDate",
  "endDate",
  "startTime",
  "endTime",
  "teamId",
] as const;

function hasCheckIns(session: EventSessionItem): boolean {
  const t = session.tally;
  return t !== null && t.present + t.late + t.absent + t.excused > 0;
}

/** Team select value for an academy-wide event (admins only; the team stays as it is). */
const WHOLE_ACADEMY = "whole-academy";

function changesFrom(
  detail: EventDetail,
  values: EventFormValues,
  series: boolean
): EventChanges {
  const { event } = detail;
  const changes: EventChanges = {};
  if (values.title !== event.title) {
    changes.title = values.title;
  }
  if (values.eventType !== event.eventType) {
    changes.eventType = values.eventType;
  }
  if (values.location !== (event.location ?? "")) {
    changes.location = values.location;
  }
  if (values.startTime !== event.startTime) {
    changes.startTime = values.startTime;
  }
  if (values.endTime !== event.endTime) {
    changes.endTime = values.endTime;
  }
  if (values.collectAttendance !== event.collectAttendance) {
    changes.collectAttendance = values.collectAttendance;
  }
  if (values.teamId !== WHOLE_ACADEMY && values.teamId !== event.teamId) {
    changes.teamId = values.teamId;
  }
  if (!series) {
    if (values.date !== event.startDate) {
      changes.startDate = values.date;
    }
    const endDate = values.endDate || null;
    if (endDate !== event.endDate) {
      changes.endDate = endDate;
    }
  }
  return changes;
}

/**
 * "Edit event" (CO-2): the new-event form filled in. A weekly series is changed on every
 * date still to come (PATCH /events/:id each); past dates keep what they had.
 */
export function EditEventDialog({
  detail,
  membership,
  today,
  open,
  onClose,
}: {
  detail: EventDetail;
  membership: Membership;
  today: DateOnly;
  open: boolean;
  onClose: () => void;
}) {
  const academyId = membership.academy.id;
  const update = useUpdateEvents(academyId);
  const { mutateAsync } = update;
  const series = detail.kind === "series";
  const targets: Id[] = series
    ? [
        ...new Set(
          detail.sessions
            .filter((s) => s.date >= today && !s.cancelled)
            .map((s) => s.eventId)
        ),
      ]
    : [detail.event.id];

  const teams = [...membership.teams];
  if (detail.team && !teams.some((t) => t.id === detail.team?.id)) {
    teams.push({ id: detail.team.id, name: detail.team.name });
  }
  if (!detail.event.teamId) {
    teams.unshift({ id: WHOLE_ACADEMY, name: "Whole academy" });
  }

  const handleSave = useCallback(
    async (values: EventFormValues) => {
      const changes = changesFrom(detail, values, series);
      // A series date someone already checked in to keeps its schedule and team (the
      // server refuses those changes once there is attendance), so it is left out.
      const schedule = SCHEDULE_FIELDS.some((field) => field in changes);
      const attended = new Set(
        detail.sessions.filter((s) => hasCheckIns(s)).map((s) => s.eventId)
      );
      const eventIds =
        series && schedule
          ? targets.filter((id) => !attended.has(id))
          : targets;
      const skipped = targets.length - eventIds.length;
      if (Object.keys(changes).length === 0 || eventIds.length === 0) {
        if (skipped > 0) {
          toast.error(
            "Students have already checked in, so those dates keep their times and team."
          );
        }
        onClose();
        return;
      }
      try {
        const { updated } = await mutateAsync({ eventIds, changes });
        const note =
          skipped > 0
            ? `. ${skipped} with check-ins kept ${skipped === 1 ? "its" : "their"} times.`
            : "";
        toast.success(
          `${updated > 1 ? `${updated} dates updated` : "Event saved"}${note}`
        );
        onClose();
      } catch (error) {
        toast.error(eventErrorMessage(error));
        throw error;
      }
    },
    [detail, mutateAsync, onClose, series, targets]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        onClose();
      }
    },
    [onClose]
  );

  const { event } = detail;
  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="md:max-w-[560px]" mobile="fullscreen">
        <DialogHeader>
          <DialogTitle>Edit event</DialogTitle>
          <DialogDescription>
            {series
              ? `Changes apply to the ${targets.length} dates still to come. Past sessions keep their details.`
              : "Dates, times and team can't change once students have checked in."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="pt-5 pb-7">
          {open ? (
            <NewEventForm
              academyId={academyId}
              defaults={{ date: event.startDate, today }}
              initial={{
                title: event.title,
                eventType: event.eventType,
                teamId: event.teamId ?? WHOLE_ACADEMY,
                date: event.startDate,
                endDate: event.endDate ?? "",
                startTime: event.startTime ?? "",
                endTime: event.endTime ?? "",
                location: event.location ?? "",
                collectAttendance: event.collectAttendance,
              }}
              mode={series ? "edit-series" : "edit-one"}
              onSave={handleSave}
              saveLabel={
                series ? `Save ${targets.length} dates` : "Save changes"
              }
              teams={teams}
            />
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
