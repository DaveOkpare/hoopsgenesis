import { buttonVariants } from "@hoops-genesis/ui/components/button";
import { CountryDot } from "@hoops-genesis/ui/components/chip";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AuthTitle, authSubmitClass } from "@/components/auth/auth-parts";
import { BrandMark } from "@/components/brand-mark";
import { formatWeekdayDayMonth } from "@/features/join-codes/describe";
import type {
  InvitationCodePreview,
  JoinedDetails,
} from "@/features/join-codes/queries";
import { countryName } from "@/features/viewer/selectors";
import { firstName } from "@/lib/format";

const SPORT = "Basketball";

function CheckDisc() {
  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-success max-md:size-14">
      <svg
        aria-hidden="true"
        className="size-[22px] max-md:size-[26px]"
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
        viewBox="0 0 22 22"
      >
        <path d="M5.5 11.5l3.8 3.8 7.2-8" />
      </svg>
    </div>
  );
}

function Row({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-4 border-line border-t px-4 py-[13px] max-md:px-[14px] max-md:py-3",
        className
      )}
    >
      <dt className="text-[15px] text-muted leading-5">{label}</dt>
      <dd className="text-right font-semibold text-[15px] text-ink leading-5">
        {value}
      </dd>
    </div>
  );
}

function NextSession({
  session,
}: {
  session: NonNullable<JoinedDetails["nextSession"]>;
}) {
  const day = formatWeekdayDayMonth(`${session.sessionDate}T12:00:00Z`, "UTC");
  const when = session.startTime ? `${day} · ${session.startTime}` : day;
  return (
    <>
      {when}
      {session.location ? (
        <span className="max-md:hidden"> · {session.location}</span>
      ) : null}
    </>
  );
}

/**
 * "You're in" after joining with a code (Paper 9HB-0 web, 9JO-0 phone). Spec: Confirm →
 * "You're in" → Today. `details` (place, next session) is read as the new member and
 * may still be loading (undefined) or have failed (null): the rows then wait or drop.
 */
export function JoinedWithCode({
  details,
  displayCode,
  joinerName,
  preview,
  todayHref,
}: {
  details: JoinedDetails | null | undefined;
  displayCode: string;
  joinerName: string;
  preview: Pick<InvitationCodePreview, "academy" | "role" | "team">;
  todayHref: string;
}) {
  const academyName = preview.academy.name;
  return (
    <div className="flex flex-col gap-[22px] max-md:flex-1 max-md:justify-between max-md:gap-8">
      <div className="flex flex-col gap-[22px] max-md:gap-5">
        <div className="flex items-center gap-[10px] max-md:flex-col max-md:items-start max-md:gap-5">
          <CheckDisc />
          <p className="font-medium text-sm text-success uppercase leading-[18px] tracking-label max-md:text-[13px] max-md:leading-4">
            Joined with code {displayCode}
          </p>
        </div>
        <AuthTitle className="text-[52px] leading-[52px] max-md:text-[46px] max-md:leading-[46px]">
          You’re in, {firstName(joinerName)}
        </AuthTitle>
        <div className="flex flex-col rounded-[20px] border border-line bg-white">
          <div className="flex items-center gap-[14px] p-4 max-md:gap-3 max-md:p-[14px]">
            <BrandMark
              className="size-12 rounded-[14px] text-[20px] leading-6 max-md:size-10 max-md:rounded-[12px] max-md:text-base max-md:leading-5"
              size={44}
            />
            <div className="flex min-w-0 flex-col gap-[3px] max-md:gap-[2px]">
              <p className="font-semibold text-base text-ink leading-5 max-md:text-[15px]">
                {academyName}
              </p>
              {details ? (
                <p className="flex items-center gap-[6px] text-[13px] text-muted leading-4">
                  <CountryDot country={details.country} />
                  {details.city}, {countryName(details.country)}
                </p>
              ) : null}
              {details === undefined ? <Skeleton className="h-4 w-28" /> : null}
            </div>
          </div>
          <dl>
            <Row
              className="max-md:hidden"
              label="Role"
              value={preview.role === "coach" ? "Coach" : "Student"}
            />
            <Row
              label="Team"
              value={
                preview.team ? `${preview.team.name} · ${SPORT}` : "No team yet"
              }
            />
            {details?.nextSession ? (
              <Row
                label="Next session"
                value={<NextSession session={details.nextSession} />}
              />
            ) : null}
          </dl>
        </div>
      </div>
      <div className="flex flex-col gap-[22px] max-md:gap-[10px]">
        <Link
          className={cn(buttonVariants({ size: "xl" }), authSubmitClass)}
          to={todayHref}
        >
          Go to Today
        </Link>
        <p className="text-[13px] text-muted leading-[18px] max-md:p-3 max-md:text-center">
          {academyName} is now in your academy list.
          {preview.role === "student" && preview.team ? (
            <span className="max-md:hidden">
              {" "}
              Your coaches can see you on the {preview.team.name} team.
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
