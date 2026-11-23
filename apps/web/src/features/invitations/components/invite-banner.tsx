import { BrandMark } from "@/components/brand-mark";
import type { InvitationDetails } from "@/features/invitations/queries";

const ROLE_LABELS = {
  admin: "Admin",
  coach: "Coach",
  student: "Student",
} as const;

const STARTS_WITH_VOWEL = /^[aeiou]/i;

function article(word: string) {
  return STARTS_WITH_VOWEL.test(word) ? "an" : "a";
}

/** "Hoops Genesis Kigali · Sharika D. invited you as a student on U14" (62J-0 / 62L-0). */
export function InviteBanner({
  invitation,
}: {
  invitation: InvitationDetails;
}) {
  const { academyName, inviterName, role, teamName } = invitation;
  const phoneLine = [ROLE_LABELS[role], teamName, `invited by ${inviterName}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <section
      aria-label="Your invite"
      className="flex items-center gap-[14px] rounded-[18px] bg-orange-soft p-[14px] max-md:gap-3 max-md:p-3"
    >
      <BrandMark
        className="text-lg leading-[22px] max-md:size-10 max-md:text-base max-md:leading-5"
        size={44}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-semibold text-[15px] text-ink leading-5">
          {academyName}
        </p>
        <p className="text-[13px] text-ink-soft leading-[18px] max-md:hidden">
          {inviterName} invited you as {article(role)}{" "}
          <span className="font-semibold">{role}</span>
          {teamName ? (
            <>
              {" "}
              on <span className="font-semibold">{teamName}</span>
            </>
          ) : null}
        </p>
        <p className="text-[13px] text-ink-soft leading-[17px] md:hidden">
          {phoneLine}
        </p>
      </div>
    </section>
  );
}
