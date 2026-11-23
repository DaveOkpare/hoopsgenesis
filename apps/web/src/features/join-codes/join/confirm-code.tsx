import { Button } from "@hoops-genesis/ui/components/button";
import { CountryDot } from "@hoops-genesis/ui/components/chip";
import { cn } from "@hoops-genesis/ui/lib/utils";

import {
  AuthTitle,
  authSubmitClass,
  ChevronLeftIcon,
} from "@/components/auth/auth-parts";
import { BrandMark } from "@/components/brand-mark";
import type { InvitationCodePreview } from "@/features/join-codes/queries";
import type { Country } from "@/features/types";
import { countryName } from "@/features/viewer/selectors";

const SPORT = "Basketball";

export interface PreviewExtras {
  city: string;
  coachNames: string[];
  country: Country;
}

/** "Join Hoops Genesis Kigali as a student on U14?" */
export function confirmQuestion(preview: InvitationCodePreview): string {
  const team = preview.team ? ` on ${preview.team.name}` : "";
  return `Join ${preview.academy.name} as a ${preview.role}${team}?`;
}

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function Row({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
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

/** What the code joins: academy, role, team and coaches (part of 6WR-0 / 6WT-0, and "You're in"). */
export function GrantCard({
  extras,
  preview,
}: {
  extras: PreviewExtras | null;
  preview: Pick<InvitationCodePreview, "academy" | "role" | "team">;
}) {
  const coaches = extras?.coachNames ?? [];
  return (
    <div className="flex flex-col rounded-[20px] border border-line bg-white">
      <div className="flex items-center gap-[14px] p-4 max-md:gap-3 max-md:p-[14px]">
        <BrandMark
          className="size-12 rounded-[14px] text-[20px] leading-6 max-md:size-10 max-md:rounded-[12px] max-md:text-base max-md:leading-5"
          size={44}
        />
        <div className="flex min-w-0 flex-col gap-[3px] max-md:gap-[2px]">
          <p className="font-semibold text-base text-ink leading-5 max-md:text-[15px]">
            {preview.academy.name}
          </p>
          {extras ? (
            <p className="flex items-center gap-[6px] text-[13px] text-muted leading-4">
              <CountryDot country={extras.country} />
              {extras.city}, {countryName(extras.country)}
            </p>
          ) : null}
        </div>
      </div>
      <dl>
        <Row
          className="max-md:hidden"
          label="Role"
          value={roleLabel(preview.role)}
        />
        <Row
          label="Team"
          value={
            preview.team ? `${preview.team.name} · ${SPORT}` : "No team yet"
          }
        />
        {coaches.length > 0 ? (
          <Row label="Coaches" value={coaches.join(", ")} />
        ) : null}
      </dl>
    </div>
  );
}

/** "Join … as a student on U14?" (Paper 6WR-0 web, 6WT-0 phone). Nothing happens until "Yes, join". */
export function ConfirmCode({
  displayCode,
  extras,
  joining,
  onJoin,
  onWrongCode,
  preview,
}: {
  displayCode: string;
  extras: PreviewExtras | null;
  joining: boolean;
  onJoin: () => void;
  onWrongCode: () => void;
  preview: InvitationCodePreview;
}) {
  return (
    <div className="flex flex-col gap-[22px] max-md:flex-1 max-md:gap-5">
      <Button
        aria-label="Back to the code"
        className="md:hidden"
        onClick={onWrongCode}
        size="icon"
        variant="secondary"
      >
        <ChevronLeftIcon />
      </Button>
      <p className="font-medium text-muted text-sm uppercase leading-[18px] tracking-label max-md:text-[13px] max-md:leading-4">
        Code {displayCode}
      </p>
      <AuthTitle className="text-[52px] leading-[52px] max-md:text-[46px] max-md:leading-[46px]">
        {confirmQuestion(preview)}
      </AuthTitle>
      <GrantCard extras={extras} preview={preview} />
      <div className="flex gap-[10px] max-md:order-last max-md:mt-auto max-md:flex-col">
        <Button
          className={cn(authSubmitClass, "flex-1 basis-0")}
          disabled={joining}
          onClick={onJoin}
          size="xl"
          variant="brand"
        >
          {joining ? "Joining…" : "Yes, join"}
        </Button>
        <Button
          className={cn(
            authSubmitClass,
            "flex-1 basis-0 max-md:border-0 max-md:p-3 max-md:text-base max-md:leading-5"
          )}
          onClick={onWrongCode}
          size="xl"
          variant="outline"
        >
          Wrong code
        </Button>
      </div>
      <p className="text-[13px] text-muted leading-[18px] max-md:hidden">
        The academy admin will see that you joined with this code.
      </p>
    </div>
  );
}
