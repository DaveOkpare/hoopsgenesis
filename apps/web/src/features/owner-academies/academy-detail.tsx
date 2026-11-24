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
  DialogTrigger,
} from "@hoops-genesis/ui/components/dialog";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import {
  OWNER_CAN_REPLACE_QR,
  type PlatformAcademyDetail,
  platformAcademyQueryOptions,
  useRegenerateAcademyQr,
} from "@/features/owner-academies/queries";
import type { Id } from "@/features/types";
import { errorMessage } from "@/lib/api-client";
import { formatDayMonth, formatRelativeDay } from "@/lib/format";
import { appNow } from "@/lib/preview";

function formatCreated(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[2px] rounded-[12px] bg-white p-3">
      <p className="font-display text-[28px] text-ink leading-none">{value}</p>
      <p className="text-[13px] text-muted leading-4">{label}</p>
    </div>
  );
}

function ReplaceQrDialog({ detail }: { detail: PlatformAcademyDetail }) {
  const [open, setOpen] = useState(false);
  const regenerate = useRegenerateAcademyQr();
  const { academy } = detail;
  const confirm = useCallback(() => {
    regenerate.mutate(
      { academyId: academy.id },
      {
        onSuccess: () => {
          setOpen(false);
          toast.success("QR code replaced", {
            description: `Ask the ${academy.shortName} admin to print the new one.`,
          });
        },
        onError: (error) =>
          toast.error(
            errorMessage(error, "The QR code couldn't be replaced. Try again.")
          ),
      }
    );
  }, [regenerate, academy.id, academy.shortName]);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={<Button className="px-[14px]" size="sm" variant="outline" />}
      >
        Replace…
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Replace QR code</DialogTitle>
          <DialogDescription>
            Every printed copy for {academy.name} stops working straight away.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-[15px] text-ink leading-body">
            Students can't check in until the academy admin prints and puts up
            the new code. This is written to the audit log with your name.
          </p>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button
            disabled={regenerate.isPending}
            onClick={confirm}
            variant="destructive"
          >
            {regenerate.isPending ? "Replacing…" : "Replace QR code"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function qrLine(detail: PlatformAcademyDetail): string {
  const { regeneratedAt, regeneratedBy } = detail.qr;
  if (!regeneratedAt) {
    return "Not replaced since setup";
  }
  const day = formatDayMonth(regeneratedAt, detail.academy.timezone);
  return regeneratedBy
    ? `Replaced ${day} by ${regeneratedBy}`
    : `Replaced ${day}`;
}

function DetailSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-busy="true"
      className={cn("flex flex-col gap-5 rounded-[20px] bg-fog p-6", className)}
    >
      <Skeleton className="h-[22px] w-1/2 bg-white" />
      <Skeleton className="h-[70px] bg-white" />
      <Skeleton className="h-[66px] rounded-[14px] bg-white" />
      <Skeleton className="h-[150px] bg-white" />
    </div>
  );
}

/**
 * The academy panel from "[Owner] Academies console": members by role, teams, QR status
 * and recent audit log (PA-3). Side panel on desktop, the whole page on phones.
 */
export function AcademyDetail({
  academyId,
  className,
  variant = "panel",
}: {
  academyId: Id;
  className?: string;
  /** panel: the console's side panel (name inside). page: tablet page, name above. */
  variant?: "panel" | "page";
}) {
  const { data: detail } = useQuery(platformAcademyQueryOptions(academyId));
  if (detail === undefined) {
    return <DetailSkeleton className={className} />;
  }
  if (!detail) {
    return (
      <section
        className={cn(
          "flex flex-col gap-1 rounded-[20px] bg-fog p-6",
          className
        )}
      >
        <h2 className="font-semibold text-ink text-lg leading-[22px]">
          Academy not found
        </h2>
        <p className="text-muted text-sm leading-[18px]">
          It may have been removed. Pick an academy from the list.
        </p>
      </section>
    );
  }
  const { academy, counts, recentActivity } = detail;
  const now = appNow();
  return (
    <section
      aria-labelledby="academy-detail-title"
      className={cn(
        "flex flex-col gap-5 rounded-[20px] bg-fog p-6 max-md:p-5",
        className
      )}
    >
      <div className="flex flex-col gap-1">
        <h2
          className={cn(
            "font-semibold text-ink text-lg leading-[22px]",
            variant === "page" && "sr-only"
          )}
          id="academy-detail-title"
        >
          {academy.name}
        </h2>
        <p className="text-muted text-sm leading-[18px]">
          Created {formatCreated(academy.createdAt, academy.timezone)} ·{" "}
          {academy.timezone} · {academy.defaultCurrency}
        </p>
        {detail.pendingAdminEmail ? (
          <p className="text-orange-deep text-sm leading-[18px]">
            Admin invited · {detail.pendingAdminEmail} hasn't accepted yet
          </p>
        ) : null}
      </div>
      <div className="flex gap-2 max-md:grid max-md:grid-cols-2">
        <StatTile label="Admins" value={counts.admins} />
        <StatTile label="Coaches" value={counts.coaches} />
        <StatTile label="Students" value={counts.students} />
        <StatTile label="Teams" value={counts.teams} />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-[14px] bg-white px-4 py-[14px]">
        <div className="flex min-w-0 flex-col">
          <h3 className="font-semibold text-[15px] text-ink leading-[18px]">
            QR code
          </h3>
          <p className="text-[13px] text-muted leading-4">{qrLine(detail)}</p>
        </div>
        {/* No owner route replaces the QR code (only the academy admin's
            /academy-qr/regenerate); the owner uses "View as" on the admin. */}
        {OWNER_CAN_REPLACE_QR ? <ReplaceQrDialog detail={detail} /> : null}
      </div>
      <div className="flex flex-col">
        <h3 className="pb-2 font-semibold text-[13px] text-muted uppercase leading-4 tracking-label">
          Recent activity
        </h3>
        {recentActivity.length === 0 ? (
          <p className="border-line border-t py-[10px] text-muted text-sm leading-[18px]">
            Nothing yet.
          </p>
        ) : (
          <ul>
            {recentActivity.map((entry) => (
              <li
                className="flex justify-between gap-3 border-line border-t py-[10px]"
                key={entry.id}
              >
                <span className="text-ink text-sm leading-[18px]">
                  {entry.summary}
                </span>
                <span className="shrink-0 text-[13px] text-muted leading-4">
                  {formatRelativeDay(entry.createdAt, academy.timezone, now)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex border-line border-t pt-[10px]">
          <Link
            className="font-semibold text-ink text-sm leading-[18px] underline decoration-1 underline-offset-[3px] hover:decoration-2"
            search={{ academy: academy.id }}
            to="/owner/audit"
          >
            Open full audit log
          </Link>
        </div>
      </div>
    </section>
  );
}
