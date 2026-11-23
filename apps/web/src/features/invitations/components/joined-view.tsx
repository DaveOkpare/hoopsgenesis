import { buttonVariants } from "@hoops-genesis/ui/components/button";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { AuthTitle, authSubmitClass } from "@/components/auth/auth-parts";
import { BrandMark } from "@/components/brand-mark";
import { formatSessionSlot } from "@/features/invitations/format";
import { joinSummaryQueryOptions } from "@/features/invitations/queries";
import { firstName } from "@/lib/format";

/** "You're in, Aline" after accepting an invite (Paper 59H-0). Render in an orange AuthLayout. */
export function JoinedView({ invitationId }: { invitationId: string }) {
  const { data: summary } = useSuspenseQuery(
    joinSummaryQueryOptions(invitationId)
  );
  const rows = [
    summary.coachNames.length > 0
      ? { label: "Coaches", value: summary.coachNames.join(", ") }
      : null,
    summary.nextSession
      ? { label: "Next session", value: formatSessionSlot(summary.nextSession) }
      : null,
    { label: "Check in", value: "Scan the code at the door" },
  ].filter((row) => row !== null);

  return (
    <div className="flex flex-col gap-10 max-md:flex-1 max-md:justify-between max-md:pt-12">
      <div className="flex flex-col gap-[22px]">
        <BrandMark
          className="size-16 rounded-[18px] text-[28px] text-orange leading-8"
          size={56}
          tone="ink"
        />
        <AuthTitle className="text-[64px] leading-[60px]">
          You're in, {firstName(summary.memberName)}
        </AuthTitle>
        <p className="text-ink text-lg leading-[26px]">
          You've joined{" "}
          <span className="font-semibold">{summary.academyName}</span>
          {summary.teamName ? (
            <>
              , on the <span className="font-semibold">{summary.teamName}</span>{" "}
              basketball team.
            </>
          ) : (
            "."
          )}
        </p>
        <dl className="flex flex-col rounded-[20px] bg-white px-4 py-1">
          {rows.map((row) => (
            <div
              className="flex justify-between gap-4 border-line border-b py-[14px] last:border-b-0"
              key={row.label}
            >
              <dt className="text-[15px] text-muted leading-5">{row.label}</dt>
              <dd className="text-right font-semibold text-[15px] text-ink leading-5">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <Link
        className={cn(
          buttonVariants({ size: "xl" }),
          authSubmitClass,
          "gap-2.5"
        )}
        to="/app"
      >
        Go to Today
        <svg
          aria-hidden="true"
          fill="none"
          height="18"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          viewBox="0 0 18 18"
          width="18"
        >
          <path d="M4 9h10M10 5l4 4-4 4" />
        </svg>
      </Link>
    </div>
  );
}
