import { Button } from "@hoops-genesis/ui/components/button";
import { DialogClose, DialogTitle } from "@hoops-genesis/ui/components/dialog";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import { ExtendMenu } from "@/features/join-codes/code-detail";
import { copyWithToast, shareMessage } from "@/features/join-codes/copy";
import {
  codeFor,
  codeStatusLabel,
  formatWeekdayDayMonth,
  shareMessage as messageFor,
  usesLong,
} from "@/features/join-codes/describe";
import { ShareIcon } from "@/features/join-codes/icons";
import {
  canExtendJoinCodes,
  type InvitationCode,
} from "@/features/join-codes/queries";
import type { Id } from "@/features/types";
import { formatRelativeDay, initials } from "@/lib/format";

const SHOWN_JOINERS = 2;

const outlinePill =
  "h-auto flex-1 basis-0 p-[14px] text-[15px] leading-5 max-md:p-[14px]";

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 16 16"
      width="16"
    >
      <path d="M10 3L5 8l5 5" />
    </svg>
  );
}

/** "Today" or "Sun 22 Nov" (9LI-0). */
function joinedOn(at: string, now: Date, timeZone: string): string {
  return formatRelativeDay(at, timeZone, now) === "Today"
    ? "Today"
    : formatWeekdayDayMonth(at, timeZone);
}

function UsesValue({ code }: { code: InvitationCode }) {
  const [count, rest] = usesLong(code).split(" · ");
  return (
    <>
      {count}
      {rest ? <span className="font-normal text-muted"> · {rest}</span> : null}
    </>
  );
}

function StopsRow({
  code,
  now,
  timeZone,
}: {
  code: InvitationCode;
  now: Date;
  timeZone: string;
}) {
  if (code.status === "revoked") {
    const when = code.revokedAt
      ? formatWeekdayDayMonth(code.revokedAt, timeZone)
      : null;
    return (
      <Row
        label="Revoked"
        value={[when, code.revokeReason].filter(Boolean).join(" · ")}
      />
    );
  }
  if (!code.expiresAt) {
    return <Row label="Stops working" value="No end date" />;
  }
  const label = codeStatusLabel(code, now, timeZone);
  return (
    <Row
      label={code.status === "expired" ? "Stopped working" : "Stops working"}
      value={
        <span className="flex items-center gap-2">
          {formatWeekdayDayMonth(code.expiresAt, timeZone)}
          {label.tone === "off" ? null : (
            <span
              className={cn(
                "rounded-full px-[9px] py-[3px] font-semibold text-xs leading-4",
                label.tone === "soon"
                  ? "bg-orange-soft text-orange-deep"
                  : "bg-[#E5F5EC] text-success"
              )}
            >
              {label.text.replace("Ends in", "In")}
            </span>
          )}
        </span>
      }
    />
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-line border-b px-[14px] py-[13px] last:border-b-0">
      <dt className="text-[15px] text-muted leading-5">{label}</dt>
      <dd className="text-right font-semibold text-[15px] text-ink leading-5">
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
  const showAll = useCallback(() => setExpanded(true), []);
  return (
    <section aria-labelledby={`joined-${code.id}`} className="flex flex-col">
      <h3
        className="pb-1 font-medium text-[13px] text-muted uppercase leading-4 tracking-label"
        id={`joined-${code.id}`}
      >
        Joined with this code · {code.useCount}
      </h3>
      {shown.length === 0 ? (
        <p className="py-[10px] text-muted text-sm leading-5">Nobody yet.</p>
      ) : (
        <ul>
          {shown.map((joiner) => {
            const name = joiner.user?.name ?? "Someone";
            return (
              <li
                className="flex items-center gap-3 border-line border-b py-[10px]"
                key={`${joiner.userId}-${joiner.redeemedAt}`}
              >
                <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-fog font-semibold text-ink text-xs leading-4">
                  {initials(name)}
                </span>
                <span className="flex-1 font-semibold text-[15px] text-ink leading-5">
                  {name}
                </span>
                <span className="text-[13px] text-muted leading-4">
                  {joinedOn(joiner.redeemedAt, now, timeZone)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {!expanded && newestFirst.length > SHOWN_JOINERS ? (
        <button
          className="mt-[10px] w-fit cursor-pointer rounded-sm font-semibold text-ink text-sm leading-[18px] underline decoration-1 outline-none [text-underline-position:from-font] focus-visible:ring-2 focus-visible:ring-ink"
          onClick={showAll}
          type="button"
        >
          See all {newestFirst.length}
        </button>
      ) : null}
    </section>
  );
}

/**
 * Join code detail on a phone (Paper 9LI-0): a full page over the list, opened from a
 * row. Render inside `<DialogContent mobile="fullscreen">`.
 */
export function PhoneCodeDetail({
  academyId,
  academyName,
  code,
  now,
  onRevoke,
  timeZone,
}: {
  academyId: Id;
  academyName: string;
  code: InvitationCode;
  now: Date;
  onRevoke: (id: Id) => void;
  timeZone: string;
}) {
  const isActive = code.status === "active";
  const copyCode = useCallback(
    () => copyWithToast(code.code, "Code copied"),
    [code.code]
  );
  const copyLink = useCallback(
    () => copyWithToast(code.link, "Link copied"),
    [code.link]
  );
  const share = useCallback(
    () =>
      shareMessage(
        messageFor({ academyName, code, includeCode: true, timeZone })
      ),
    [academyName, code, timeZone]
  );
  const revoke = useCallback(() => onRevoke(code.id), [code.id, onRevoke]);
  const madeBy = code.createdBy?.name ?? "an admin";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 pt-4 pb-[max(36px,env(safe-area-inset-bottom))]">
      <div className="flex flex-col gap-[18px]">
        <div className="flex items-center justify-between">
          <DialogClose
            aria-label="Back to join codes"
            render={<Button size="icon" variant="secondary" />}
          >
            <BackIcon />
          </DialogClose>
          <DialogTitle className="font-sans font-semibold text-[17px] normal-case leading-[22px] max-md:text-[17px] max-md:leading-[22px]">
            Join code
          </DialogTitle>
          <span aria-hidden="true" className="size-9 shrink-0" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="font-medium text-[13px] text-muted uppercase leading-4 tracking-label">
            {codeFor(code)}
          </p>
          <p className="text-ink-soft text-sm leading-[19px]">
            Made by {madeBy} on{" "}
            {formatWeekdayDayMonth(code.createdAt, timeZone)}
          </p>
        </div>
        <p
          className={cn(
            "flex justify-center rounded-[20px] border-2 border-[#D0D0CC] border-dashed bg-fog px-[10px] py-[22px] font-mono font-semibold text-[28px] text-ink leading-[34px] tracking-[0.04em]",
            code.status === "revoked" && "line-through decoration-1",
            !isActive && "text-muted"
          )}
        >
          {code.code}
        </p>
        {isActive ? (
          <div className="flex gap-2">
            <Button
              className={cn(outlinePill, "border-ink")}
              onClick={copyCode}
              variant="outline"
            >
              Copy code
            </Button>
            <Button
              className={cn(outlinePill, "border-ink")}
              onClick={copyLink}
              variant="outline"
            >
              Copy link
            </Button>
          </div>
        ) : null}
        <dl className="flex flex-col rounded-md border border-line">
          <Row label="Uses" value={<UsesValue code={code} />} />
          <StopsRow code={code} now={now} timeZone={timeZone} />
        </dl>
        <Joiners code={code} now={now} timeZone={timeZone} />
      </div>
      {isActive ? (
        <div className="mt-auto flex flex-col gap-[10px]">
          <div className="flex gap-2">
            {/* No endpoint changes a code's expiry, so "Extend" shows only in preview. */}
            {code.expiresAt && canExtendJoinCodes ? (
              <ExtendMenu
                academyId={academyId}
                className={outlinePill}
                code={code}
                now={now}
                timeZone={timeZone}
              />
            ) : null}
            <Button
              className={cn(outlinePill, "text-orange-deep")}
              onClick={revoke}
              variant="outline"
            >
              Revoke
            </Button>
          </div>
          <Button
            className="h-auto w-full gap-[10px] p-[18px] text-[17px] leading-[22px]"
            onClick={share}
            size="xl"
          >
            <ShareIcon className="size-[18px]" />
            Share again
          </Button>
        </div>
      ) : (
        <p className="mt-auto text-[13px] text-muted leading-[18px]">
          This code no longer works. People who joined with it stay in the
          academy.
        </p>
      )}
    </div>
  );
}
