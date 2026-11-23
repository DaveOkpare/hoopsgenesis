import { Button } from "@hoops-genesis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@hoops-genesis/ui/components/dropdown-menu";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { type MouseEvent, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { copyWithToast } from "@/features/join-codes/copy";
import {
  codeFor,
  displayLink,
  formatExpiry,
  formatWeekdayDayMonth,
  usesLong,
} from "@/features/join-codes/describe";
import {
  CODE_LIMITS,
  canExtendJoinCodes,
  type InvitationCode,
  useExtendJoinCode,
} from "@/features/join-codes/queries";
import type { Id } from "@/features/types";
import { formatDayMonth, formatRelativeDay, formatTime } from "@/lib/format";

const SHOWN_JOINERS = 2;
const DAY_MS = 86_400_000;
const EXTEND_BY_DAYS = [7, 30] as const;

function joinedWhen(at: string, now: Date, timeZone: string): string {
  const day = formatRelativeDay(at, timeZone, now);
  return day === "Today" ? `Today, ${formatTime(at, timeZone)}` : day;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-line border-b py-[11px]">
      <dt className="text-muted text-sm leading-[18px]">{label}</dt>
      <dd className="text-right font-semibold text-ink text-sm leading-[18px]">
        {value}
      </dd>
    </div>
  );
}

function Joiners({
  code,
  now,
  timeZone,
}: {
  code: InvitationCode;
  now: Date;
  timeZone: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const newestFirst = useMemo(
    () => [...code.redemptions].reverse(),
    [code.redemptions]
  );
  const shown = expanded ? newestFirst : newestFirst.slice(0, SHOWN_JOINERS);
  const more = code.useCount - shown.length;
  const showAll = useCallback(() => setExpanded(true), []);

  return (
    <section
      aria-labelledby={`joined-${code.id}`}
      className="flex flex-col gap-[10px]"
    >
      <h3
        className="font-semibold text-ink text-sm leading-[18px]"
        id={`joined-${code.id}`}
      >
        Joined with this code
      </h3>
      {shown.length === 0 ? (
        <p className="text-[13px] text-muted leading-[18px]">Nobody yet.</p>
      ) : (
        <ul
          className={cn(
            "flex flex-col gap-[10px]",
            expanded && "max-h-[260px] overflow-y-auto"
          )}
        >
          {shown.map((joiner) => (
            <li
              className="flex justify-between gap-4"
              key={`${joiner.userId}-${joiner.redeemedAt}`}
            >
              <span className="text-ink text-sm leading-[18px]">
                {joiner.user?.name ?? "Someone"}
              </span>
              <span className="shrink-0 text-[13px] text-muted leading-[18px]">
                {joinedWhen(joiner.redeemedAt, now, timeZone)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {more > 0 && !expanded ? (
        <button
          className="w-fit cursor-pointer rounded-sm text-[13px] text-muted leading-[18px] outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ink"
          onClick={showAll}
          type="button"
        >
          + {more} more
        </button>
      ) : null}
    </section>
  );
}

function ExtendMenu({
  academyId,
  code,
  now,
  timeZone,
}: {
  academyId: Id;
  code: InvitationCode;
  now: Date;
  timeZone: string;
}) {
  const extend = useExtendJoinCode();
  const latest = now.getTime() + CODE_LIMITS.maxLifetimeMs;
  const from = Math.max(now.getTime(), Date.parse(code.expiresAt ?? ""));
  const options = EXTEND_BY_DAYS.map((days) => {
    const target = Math.min(from + days * DAY_MS, latest);
    return { days, expiresAt: new Date(target).toISOString() };
  }).filter((option, index, all) => {
    const isLater = Date.parse(option.expiresAt) > from;
    const isNew =
      all.findIndex((o) => o.expiresAt === option.expiresAt) === index;
    return isLater && isNew;
  });

  const handleExtend = useCallback(
    async (event: MouseEvent<HTMLElement>) => {
      const { expiresAt } = event.currentTarget.dataset;
      if (!expiresAt) {
        return;
      }
      try {
        await extend.mutateAsync({ academyId, id: code.id, expiresAt });
        toast.success(
          `${code.code} now works until ${formatWeekdayDayMonth(expiresAt, timeZone)}.`
        );
      } catch {
        toast.error("Couldn't extend the code. Try again.");
      }
    },
    [academyId, code.code, code.id, extend, timeZone]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="flex-1 basis-0 py-[11px] text-sm"
            disabled={options.length === 0 || extend.isPending}
            variant="outline"
          />
        }
      >
        Extend
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((option) => (
          <DropdownMenuItem
            data-expires-at={option.expiresAt}
            key={option.expiresAt}
            onClick={handleExtend}
          >
            Until {formatExpiry(option.expiresAt, timeZone)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Detail of one code (right panel of 6G1-0; a bottom sheet on phones).
 * Active codes can be copied, extended and revoked; others are read only.
 */
export function CodeDetail({
  academyId,
  className,
  code,
  now,
  onRevoke,
  timeZone,
}: {
  academyId: Id;
  className?: string;
  code: InvitationCode;
  now: Date;
  onRevoke: (id: Id) => void;
  timeZone: string;
}) {
  const isActive = code.status === "active";
  const revoke = useCallback(() => onRevoke(code.id), [code.id, onRevoke]);
  const copyCode = useCallback(
    () => copyWithToast(code.code, "Code copied"),
    [code.code]
  );
  const copyLink = useCallback(
    () => copyWithToast(code.link, "Link copied"),
    [code.link]
  );

  let expiresLabel = "Expires";
  if (code.status === "expired") {
    expiresLabel = "Expired";
  }
  const expiresValue = code.expiresAt
    ? formatExpiry(code.expiresAt, timeZone)
    : "No end date";

  return (
    <div className={cn("flex flex-col gap-[18px]", className)}>
      <div className="flex flex-col gap-[6px]">
        <p className="font-medium text-[13px] text-muted uppercase leading-4 tracking-label">
          {codeFor(code)}
        </p>
        <p
          className={cn(
            "font-mono font-semibold text-[30px] text-ink leading-9 max-md:text-[26px]",
            code.status === "revoked" && "line-through decoration-1"
          )}
        >
          {code.code}
        </p>
      </div>
      {isActive ? (
        <>
          <div className="flex gap-2">
            <Button
              className="flex-1 basis-0 py-[11px] text-sm"
              onClick={copyCode}
            >
              Copy code
            </Button>
            <Button
              className="flex-1 basis-0 border-ink py-[11px] text-sm"
              onClick={copyLink}
              variant="outline"
            >
              Copy link
            </Button>
          </div>
          <p className="break-all font-mono text-muted text-xs leading-4">
            {displayLink(code.link)}
          </p>
        </>
      ) : null}
      <dl className="flex flex-col border-line border-t">
        <DetailRow label="Uses" value={usesLong(code)} />
        {code.status === "revoked" ? (
          <DetailRow
            label="Revoked"
            value={[
              code.revokedAt ? formatDayMonth(code.revokedAt, timeZone) : null,
              code.revokeReason,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        ) : (
          <DetailRow label={expiresLabel} value={expiresValue} />
        )}
      </dl>
      <Joiners code={code} now={now} timeZone={timeZone} />
      {isActive ? (
        <div className="flex gap-2 border-line border-t pt-4">
          {/* No endpoint changes a code's expiry, so "Extend" shows only in preview. */}
          {code.expiresAt && canExtendJoinCodes ? (
            <ExtendMenu
              academyId={academyId}
              code={code}
              now={now}
              timeZone={timeZone}
            />
          ) : null}
          <Button
            className="flex-1 basis-0 py-[11px] text-orange-deep text-sm"
            onClick={revoke}
            variant="outline"
          >
            Revoke
          </Button>
        </div>
      ) : (
        <p className="border-line border-t pt-4 text-[13px] text-muted leading-[18px]">
          This code no longer works. People who joined with it stay in the
          academy.
        </p>
      )}
    </div>
  );
}
