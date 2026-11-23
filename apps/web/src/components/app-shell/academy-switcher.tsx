import { CountryDot } from "@hoops-genesis/ui/components/chip";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@hoops-genesis/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@hoops-genesis/ui/components/dropdown-menu";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AvatarUserMenu } from "@/components/app-shell/user-menu";
import { BrandMark } from "@/components/brand-mark";
import type { Membership } from "@/features/viewer/api";
import {
  useActiveMembership,
  useSetActiveAcademy,
  useViewer,
} from "@/features/viewer/queries";
import {
  academyChipLabel,
  academyCountry,
  countryName,
  primaryRole,
  roleLabel,
} from "@/features/viewer/selectors";
import { errorMessage } from "@/lib/api-client";

function UpDownChevron() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0 text-muted"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M5 6l3-3 3 3M5 10l3 3 3-3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function AcademyMeta({ membership }: { membership: Membership }) {
  const country = academyCountry(membership.academy);
  return (
    <span className="flex items-center gap-[6px]">
      <CountryDot country={country} />
      <span className="truncate text-[13px] text-muted leading-4">
        {countryName(country)} · {roleLabel(primaryRole(membership))}
      </span>
    </span>
  );
}

/** Click handler for elements carrying data-academy-id: switch, then go to that role's home. */
function useSwitchAcademy() {
  const navigate = useNavigate();
  const viewer = useViewer();
  const setActive = useSetActiveAcademy();
  return (event: { currentTarget: HTMLElement }) => {
    const { academyId } = event.currentTarget.dataset;
    const membership = viewer.memberships.find(
      (m) => m.academy.id === academyId
    );
    if (!membership || academyId === viewer.activeAcademyId) {
      return;
    }
    setActive.mutate(
      { academyId: membership.academy.id },
      {
        onSuccess: () => navigate({ to: `/${primaryRole(membership)}` }),
        onError: (error) =>
          toast.error(
            errorMessage(error, "Couldn’t switch academy. Try again.")
          ),
      }
    );
  };
}

/**
 * Academy card ("Hoops Genesis Kigali · Rwanda · Admin"); opens the academy menu when the
 * person has more than one academy.
 * variant="card": top of the light sidebar and the tablet drawer (full width, 36px mark).
 * variant="bar": compact chip in the tablet top bar (32px mark).
 */
export function AcademySwitcher({
  variant = "card",
}: {
  variant?: "card" | "bar";
} = {}) {
  const viewer = useViewer();
  const active = useActiveMembership();
  const switchTo = useSwitchAcademy();
  if (!active) {
    return null;
  }
  const canSwitch = viewer.memberships.length > 1;
  const isBar = variant === "bar";
  const card = (
    <>
      <BrandMark size={isBar ? 32 : 36} />
      <span
        className={cn("flex min-w-0 flex-col gap-px", isBar ? "" : "flex-1")}
      >
        <span className="truncate font-semibold text-ink text-sm leading-[18px]">
          {active.academy.name}
        </span>
        <AcademyMeta membership={active} />
      </span>
      {canSwitch ? <UpDownChevron /> : null}
    </>
  );
  const cardClass = isBar
    ? "flex min-w-0 max-w-[360px] items-center gap-[10px] rounded-[14px] border border-line bg-white py-[6px] pr-3 pl-[6px] text-left"
    : "flex w-full items-center gap-[10px] rounded-[14px] border border-line bg-white p-[10px] text-left";

  if (!canSwitch) {
    return <div className={cardClass}>{card}</div>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Academy: ${active.academy.name}. Switch academy`}
        className={cn(
          cardClass,
          "cursor-pointer outline-none hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-ink"
        )}
      >
        {card}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        alignOffset={-2}
        className="w-[232px]"
        sideOffset={isBar ? 8 : 16}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Your academies</DropdownMenuLabel>
          {viewer.memberships.map((membership) => {
            const isActive = membership.academy.id === active.academy.id;
            return (
              <DropdownMenuItem
                className={cn(
                  "items-center gap-[10px] p-[10px]",
                  isActive && "bg-fog"
                )}
                data-academy-id={membership.academy.id}
                key={membership.academy.id}
                onClick={switchTo}
              >
                <BrandMark size={32} tone={isActive ? "orange" : "ink"} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold text-ink text-sm leading-[18px]">
                    {membership.academy.name}
                  </span>
                  <AcademyMeta membership={membership} />
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChipChevron() {
  return (
    <svg aria-hidden="true" height="12" viewBox="0 0 12 12" width="12">
      <path
        d="M3 4.5l3 3 3-3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/**
 * Phone header row on home screens: academy chip (opens a switcher sheet when there is
 * more than one academy) and the account avatar. Hidden from md up, where the sidebar
 * shows the same things. Render it at the top of a page: <MobileAcademyBar />.
 */
export function MobileAcademyBar() {
  const viewer = useViewer();
  const active = useActiveMembership();
  const switchTo = useSwitchAcademy();
  if (!active) {
    return null;
  }
  const chipClass =
    "flex items-center gap-2 rounded-full bg-fog py-[5px] pr-3 pl-[5px] font-semibold text-[15px] text-ink leading-5";
  const chip = (
    <>
      <BrandMark size={26} />
      {academyChipLabel(active)}
    </>
  );
  return (
    <div className="flex items-center justify-between md:hidden">
      {viewer.memberships.length > 1 ? (
        <Dialog>
          <DialogTrigger
            className={cn(
              chipClass,
              "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ink"
            )}
          >
            {chip}
            <ChipChevron />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Your academies</DialogTitle>
            </DialogHeader>
            <DialogBody className="gap-1 pb-8">
              {viewer.memberships.map((membership) => {
                const isActive = membership.academy.id === active.academy.id;
                return (
                  <button
                    className={cn(
                      "flex items-center gap-3 rounded-[14px] p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ink",
                      isActive && "bg-fog"
                    )}
                    data-academy-id={membership.academy.id}
                    key={membership.academy.id}
                    onClick={switchTo}
                    type="button"
                  >
                    <BrandMark size={36} tone={isActive ? "orange" : "ink"} />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold text-[15px] text-ink leading-5">
                        {membership.academy.name}
                      </span>
                      <AcademyMeta membership={membership} />
                    </span>
                  </button>
                );
              })}
            </DialogBody>
          </DialogContent>
        </Dialog>
      ) : (
        <span className={chipClass}>{chip}</span>
      )}
      <AvatarUserMenu />
    </div>
  );
}
