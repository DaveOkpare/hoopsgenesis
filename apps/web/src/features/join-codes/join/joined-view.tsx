import { buttonVariants } from "@hoops-genesis/ui/components/button";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import { AuthTitle, authSubmitClass } from "@/components/auth/auth-parts";
import { BrandMark } from "@/components/brand-mark";
import { ArrowRightIcon } from "@/components/icons";
import type { PreviewExtras } from "@/features/join-codes/join/confirm-code";
import type { InvitationCodePreview } from "@/features/join-codes/queries";
import { firstName } from "@/lib/format";

/**
 * "You're in" after joining with a code. The spec says Confirm → "You’re in" → Today;
 * there is no artboard for it, so it reuses the invite's joined screen (59H-0).
 * Render inside an orange AuthLayout.
 */
export function JoinedWithCode({
  extras,
  joinerName,
  preview,
  todayHref,
}: {
  extras: PreviewExtras | null;
  joinerName: string;
  preview: Pick<InvitationCodePreview, "academy" | "role" | "team">;
  todayHref: string;
}) {
  const rows = [
    { label: "Role", value: preview.role === "coach" ? "Coach" : "Student" },
    extras && extras.coachNames.length > 0
      ? { label: "Coaches", value: extras.coachNames.join(", ") }
      : null,
    preview.role === "student"
      ? { label: "Check in", value: "Scan the code at the door" }
      : null,
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
          You’re in, {firstName(joinerName)}
        </AuthTitle>
        <p className="text-ink text-lg leading-[26px]">
          You’ve joined{" "}
          <span className="font-semibold">{preview.academy.name}</span>
          {preview.team ? (
            <>
              , on the{" "}
              <span className="font-semibold">{preview.team.name}</span>{" "}
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
        to={todayHref}
      >
        Go to Today
        <ArrowRightIcon />
      </Link>
    </div>
  );
}
