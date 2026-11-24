import { CountryDot } from "@hoops-genesis/ui/components/chip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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

const ROLE_ORDER = ["admin", "coach", "student"] as const;

/** Every role in this academy, in plain words: "Admin and coach", "Coach". */
function rolesLabel(membership: Membership): string {
  const labels = ROLE_ORDER.filter((role) =>
    membership.roles.includes(role)
  ).map((role, index) =>
    index === 0 ? roleLabel(role) : roleLabel(role).toLowerCase()
  );
  if (labels.length === 0) {
    return roleLabel(primaryRole(membership));
  }
  if (labels.length === 1) {
    return labels[0] ?? "";
  }
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

function AcademyMeta({
  membership,
  allRoles = false,
}: {
  membership: Membership;
  /** "Rwanda · Admin and coach" instead of the main role only. */
  allRoles?: boolean;
}) {
  const country = academyCountry(membership.academy);
  return (
    <span className="flex items-center gap-[6px]">
      <CountryDot country={country} />
      <span className="truncate text-[13px] text-muted leading-4">
        {countryName(country)} ·{" "}
        {allRoles ? rolesLabel(membership) : roleLabel(primaryRole(membership))}
      </span>
    </span>
  );
}

/** Click handler for elements carrying data-academy-id: switch, then go to that role's home. */
function useSwitchAcademy() {
  const navigate = useNavigate();
  const viewer = useViewer();
  const setActive = useSetActiveAcademy();
  const pendingId = setActive.isPending
    ? setActive.variables?.academyId
    : undefined;
  const switchTo = (event: { currentTarget: HTMLElement }) => {
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
  return { switchTo, pendingId };
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
  const { switchTo } = useSwitchAcademy();
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

function SheetCloseIcon() {
  return (
    <svg aria-hidden="true" height="12" viewBox="0 0 14 14" width="12">
      <path
        d="M3 3l8 8M11 3l-8 8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

/** 32px fog close button used by the phone sheets (More, Your academies); 44px hit area. */
export function SheetCloseButton({ label = "Close" }: { label?: string }) {
  return (
    <DialogClose
      aria-label={label}
      className="relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-fog text-ink outline-none before:absolute before:-inset-1.5 focus-visible:ring-2 focus-visible:ring-ink"
    >
      <SheetCloseIcon />
    </DialogClose>
  );
}

function RadioMark({ checked }: { checked: boolean }) {
  if (!checked) {
    return (
      <span
        aria-hidden="true"
        className="size-6 shrink-0 rounded-full border-[#C8C8C8] border-[1.5px]"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink"
    >
      <svg aria-hidden="true" height="14" viewBox="0 0 16 16" width="14">
        <path
          d="M3.5 8.5l3 3 6-7"
          fill="none"
          stroke="#fff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    </span>
  );
}

/** Classes for the phone bottom sheets in the shell ("[Admin · Mobile] More sheet"). */
export const SHELL_SHEET_CLASS =
  "max-md:rounded-t-lg max-md:px-5 max-md:pb-[max(34px,env(safe-area-inset-bottom))]";

/*
 * The inside of the "Your academies" sheet ("[Admin · Mobile] Academy switcher", 856-0):
 * title, one card per academy with a radio mark, and a note. Picking another academy
 * calls the real setActiveAcademy, then goes to that academy's home for your role
 * there. Render it inside a <DialogContent className={SHELL_SHEET_CLASS}>.
 */
export function AcademySwitcherSheet() {
  const viewer = useViewer();
  const active = useActiveMembership();
  const { switchTo, pendingId } = useSwitchAcademy();
  return (
    <div className="flex flex-col gap-[14px] pt-[14px] md:p-7">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <DialogTitle className="text-[32px] leading-8 max-md:text-[32px] max-md:leading-8">
            Your academies
          </DialogTitle>
          <DialogDescription className="text-muted text-sm leading-[18px] max-md:leading-[18px]">
            You have a different role in each one.
          </DialogDescription>
        </div>
        <SheetCloseButton />
      </div>
      <ul aria-label="Academies" className="flex flex-col gap-2">
        {viewer.memberships.map((membership) => {
          const isActive = membership.academy.id === active?.academy.id;
          const isPending = pendingId === membership.academy.id;
          return (
            <li key={membership.academy.id}>
              <button
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-md p-[14px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:cursor-progress",
                  isActive
                    ? "border-[1.5px] border-ink"
                    : "border border-line hover:bg-fog"
                )}
                data-academy-id={membership.academy.id}
                disabled={Boolean(pendingId)}
                onClick={switchTo}
                type="button"
              >
                <BrandMark size={40} tone={isActive ? "orange" : "ink"} />
                <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <span className="font-semibold text-[15px] text-ink leading-5">
                    {membership.academy.name}
                  </span>
                  <AcademyMeta allRoles membership={membership} />
                </span>
                {isPending ? (
                  <span className="shrink-0 text-[13px] text-muted leading-4">
                    Switching…
                  </span>
                ) : (
                  <RadioMark checked={isActive} />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-[13px] text-muted leading-[18px]">
        Switching takes you to that academy’s home. Your menu changes to match
        your role there.
      </p>
    </div>
  );
}

/**
 * Phone header row on home screens: academy chip (opens the "Your academies" sheet when
 * there is more than one academy) and the account avatar. Hidden from md up, where the
 * sidebar or tablet top bar shows the same things. Render it at the top of a page:
 * <MobileAcademyBar />.
 */
export function MobileAcademyBar() {
  const viewer = useViewer();
  const active = useActiveMembership();
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
            aria-label={`Academy: ${active.academy.name}. Switch academy`}
            className={cn(
              chipClass,
              "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ink"
            )}
          >
            {chip}
            <ChipChevron />
          </DialogTrigger>
          <DialogContent className={SHELL_SHEET_CLASS}>
            <AcademySwitcherSheet />
          </DialogContent>
        </Dialog>
      ) : (
        <span className={chipClass}>{chip}</span>
      )}
      <AvatarUserMenu />
    </div>
  );
}
