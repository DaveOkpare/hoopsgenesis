import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@hoops-genesis/ui/components/dropdown-menu";
import { cn } from "@hoops-genesis/ui/lib/utils";
import type { MouseEvent } from "react";

import { MoreIcon } from "@/components/icons";
import { useIsOffline } from "@/components/offline";
import type { TeamStudent } from "@/features/team-detail/queries";
import type { DateOnly } from "@/features/types";
import { formatDayMonth } from "@/lib/format";

export type TeamPageRole = "coach" | "admin";

/** A row's ··· menu: "Log a result" (coaches) and "Remove from U14". */
export function RowMenu({
  student,
  teamName,
  viewAs,
  onRemove,
  onLogResult,
  className,
}: {
  student: TeamStudent;
  teamName: string;
  viewAs: TeamPageRole;
  onRemove: (event: MouseEvent<HTMLElement>) => void;
  onLogResult: (event: MouseEvent<HTMLElement>) => void;
  className?: string;
}) {
  // Removing needs the server.
  const offline = useIsOffline();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${student.user.name}`}
        className={cn(
          "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted outline-none hover:bg-fog focus-visible:ring-2 focus-visible:ring-ink aria-expanded:bg-fog",
          className
        )}
      >
        <MoreIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {viewAs === "coach" ? (
          <DropdownMenuItem
            data-student-id={student.user.id}
            onClick={onLogResult}
          >
            Log a result
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          data-name={student.user.name}
          data-user-id={student.user.id}
          disabled={offline}
          onClick={onRemove}
          variant="destructive"
        >
          Remove from {teamName}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const AGE_GROUP = /^U(\d+)$/i;

/** "Under 14" from "U14"; other age groups as typed. */
export function ageLabel(ageGroup: string | null): string | null {
  const match = ageGroup?.match(AGE_GROUP);
  return match ? `Under ${match[1]}` : ageGroup;
}

/** "November" for a plain date. */
export function monthOf(date: DateOnly): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function paidToText(paidTo: DateOnly): string {
  return `Paid to ${formatDayMonth(paidTo)}`;
}
