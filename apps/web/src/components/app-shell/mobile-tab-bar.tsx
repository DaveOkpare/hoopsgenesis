import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { CountryDot } from "@hoops-genesis/ui/components/chip";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@hoops-genesis/ui/components/dialog";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { Fragment, useCallback, useState } from "react";

import {
  AcademySwitcherSheet,
  SHELL_SHEET_CLASS,
  SheetCloseButton,
} from "@/components/app-shell/academy-switcher";
import {
  isNavItemActive,
  isTabBarHidden,
  type NavItem,
  type ShellConfig,
} from "@/components/app-shell/nav-config";
import { NavIcon } from "@/components/app-shell/nav-icons";
import type { NavCounts } from "@/components/app-shell/sidebar";
import { useSignOutAndLeave } from "@/components/app-shell/user-menu";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";
import {
  academyCountry,
  primaryRole,
  roleLabel,
  viewerSubtitle,
} from "@/features/viewer/selectors";
import { initials } from "@/lib/format";

const tabClass =
  "flex shrink-0 flex-col items-center gap-1 rounded-[10px] font-medium text-[#8a8a8a] text-[11px] leading-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ink";
const activeTabClass = "font-semibold text-ink";

/** Tab widths from Paper: 5 tabs 64px (admin), 4 tabs 72px (coach, student), 3 tabs 88px (owner). */
const FIVE_TABS = 5;
const FOUR_TABS = 4;

function tabWidth(count: number): string {
  if (count >= FIVE_TABS) {
    return "w-16";
  }
  if (count === FOUR_TABS) {
    return "w-[72px]";
  }
  return "w-[88px]";
}

function tabItems(config: ShellConfig): NavItem[] {
  const MAX_ORDER = 99;
  return config.nav
    .filter((item) => item.tab)
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        (a.item.tabOrder ?? MAX_ORDER + a.index) -
        (b.item.tabOrder ?? MAX_ORDER + b.index)
    )
    .map(({ item }) => item);
}

function SignOutIcon() {
  return (
    <svg aria-hidden="true" height="20" viewBox="0 0 18 18" width="20">
      <path
        d="M7 3H3.5v12H7M11 5.5L14.5 9 11 12.5M14.5 9H7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/** Who is signed in, with "Switch" (more than one academy) and the close button. */
function MoreSheetHeader({ onSwitch }: { onSwitch?: () => void }) {
  const viewer = useViewer();
  const active = useActiveMembership();
  const subtitle = active
    ? `${active.academy.name} · ${roleLabel(primaryRole(active))}`
    : viewerSubtitle(viewer);
  return (
    <div className="flex items-center gap-3 border-line border-b pt-3 pb-[14px]">
      <Avatar className="size-10 text-[13px]" size={44} tone="ink">
        <AvatarFallback>{initials(viewer.user.name)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <DialogTitle className="font-sans font-semibold text-[15px] normal-case leading-5 max-md:text-[15px] max-md:leading-5">
          {viewer.user.name}
        </DialogTitle>
        <p className="flex items-center gap-[6px]">
          {active ? (
            <CountryDot country={academyCountry(active.academy)} />
          ) : null}
          <span className="text-[13px] text-muted leading-4">{subtitle}</span>
        </p>
      </div>
      {onSwitch ? (
        <button
          className="relative shrink-0 cursor-pointer rounded-full border border-line px-3 py-[7px] font-semibold text-[13px] text-ink leading-4 outline-none before:absolute before:-inset-y-1.5 hover:bg-fog focus-visible:ring-2 focus-visible:ring-ink"
          onClick={onSwitch}
          type="button"
        >
          Switch
        </button>
      ) : null}
      <SheetCloseButton />
    </div>
  );
}

const moreRowClass =
  "flex min-h-11 items-center gap-[14px] rounded-[10px] py-3 font-medium text-base leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ink";

/*
 * Phone "More" sheet ("[Admin · Mobile] More sheet", 82K-0): who you are with "Switch"
 * (opens "Your academies" in the same sheet), the nav items that are not in the tab bar
 * (dividers as in the sidebar), and Sign out.
 */
function MoreSheet({
  items,
  pathname,
  counts,
}: {
  items: NavItem[];
  pathname: string;
  counts: NavCounts;
}) {
  const viewer = useViewer();
  const signOut = useSignOutAndLeave();
  // The sheet is open only on the page it was opened on: following a link closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const [view, setView] = useState<"menu" | "academies">("menu");
  const open = openOn === pathname;
  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpenOn(next ? pathname : null);
      setView("menu");
    },
    [pathname]
  );
  const close = useCallback(() => setOpenOn(null), []);
  const showAcademies = useCallback(() => setView("academies"), []);
  const active = items.some((item) => isNavItemActive(item, pathname, "tab"));
  const canSwitch = viewer.memberships.length > 1;
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger className={cn(tabClass, "w-16", active && activeTabClass)}>
        <NavIcon name="more" variant="tab" />
        More
      </DialogTrigger>
      <DialogContent className={SHELL_SHEET_CLASS}>
        {view === "academies" ? (
          <AcademySwitcherSheet />
        ) : (
          <div className="flex flex-col gap-[6px] md:p-7">
            <MoreSheetHeader onSwitch={canSwitch ? showAcademies : undefined} />
            <nav aria-label="More">
              <ul className="flex flex-col">
                {items.map((item) => {
                  const current = isNavItemActive(item, pathname, "tab");
                  const count = item.countKey ? counts[item.countKey] : 0;
                  return (
                    <Fragment key={String(item.to)}>
                      {item.dividerBefore ? (
                        <li aria-hidden="true" className="h-px bg-line" />
                      ) : null}
                      <li>
                        <Link
                          aria-current={current ? "page" : undefined}
                          className={cn(
                            moreRowClass,
                            "text-ink",
                            current && "font-semibold"
                          )}
                          onClick={close}
                          to={item.to}
                        >
                          <NavIcon
                            className="size-5 shrink-0"
                            name={item.icon}
                          />
                          <span className="min-w-0 flex-1">{item.label}</span>
                          {count ? (
                            <span className="font-semibold text-[13px] text-orange-deep leading-4">
                              {count}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    </Fragment>
                  );
                })}
                <li aria-hidden="true" className="h-px bg-line" />
                <li>
                  <button
                    className={cn(
                      moreRowClass,
                      "w-full cursor-pointer pt-[14px] text-left text-orange-deep"
                    )}
                    onClick={signOut}
                    type="button"
                  >
                    <SignOutIcon />
                    Sign out
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Phone tab bar (below md). Built from the same nav config as the sidebar. */
export function MobileTabBar({
  config,
  counts,
}: {
  config: ShellConfig;
  counts: NavCounts;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabs = tabItems(config);
  const rest = config.nav.filter((item) => !item.tab);
  const showMore = Boolean(config.moreTab && rest.length);
  const count = tabs.length + (showMore ? 1 : 0);
  const width = tabWidth(count);
  if (isTabBarHidden(config, pathname)) {
    return null;
  }
  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex justify-around border-line border-t bg-white pt-[10px] pb-[max(14px,env(safe-area-inset-bottom))] md:hidden",
        count < FOUR_TABS ? "px-6" : "px-3"
      )}
    >
      {tabs.map((item) => {
        const active = isNavItemActive(item, pathname, "tab");
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(tabClass, width, active && activeTabClass)}
            key={String(item.to)}
            to={item.to}
          >
            <NavIcon name={item.tabIcon ?? item.icon} variant="tab" />
            {item.tabLabel ?? item.label}
          </Link>
        );
      })}
      {showMore ? (
        <MoreSheet counts={counts} items={rest} pathname={pathname} />
      ) : null}
    </nav>
  );
}
