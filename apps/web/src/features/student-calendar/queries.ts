import { queryOptions } from "@tanstack/react-query";

import {
  academyNow,
  type EventRange,
  listEvents,
} from "@/features/student-calendar/api";
import { toDateOnly } from "@/features/student-calendar/dates";
import type { DateOnly, Id } from "@/features/types";
import { useActiveMembership } from "@/features/viewer/queries";

export type { StudentEvent } from "@/features/student-calendar/api";

export const studentEventKeys = {
  all: (academyId: Id) => ["academies", academyId, "events"] as const,
  range: (academyId: Id, range: EventRange) =>
    [...studentEventKeys.all(academyId), range] as const,
};

export function studentEventsQueryOptions(academyId: Id, range: EventRange) {
  return queryOptions({
    queryKey: studentEventKeys.range(academyId, range),
    queryFn: () => listEvents(academyId, range),
    select: (page) => page.data,
  });
}

export interface AcademyClock {
  academyId: Id;
  now: Date;
  timeZone: string;
  today: DateOnly;
}

/** The active academy, its time zone and "today" there. */
export function useAcademyClock(): AcademyClock {
  const membership = useActiveMembership();
  const timeZone = membership?.academy.timezone ?? "UTC";
  const now = academyNow();
  return {
    academyId: membership?.academy.id ?? "",
    now,
    timeZone,
    today: toDateOnly(now, timeZone),
  };
}
