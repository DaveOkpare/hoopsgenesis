import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@hoops-genesis/ui/components/drawer";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useRouterState } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { AcademySwitcher } from "@/components/app-shell/academy-switcher";
import type { ShellConfig } from "@/components/app-shell/nav-config";
import { PhoneNudgeCard } from "@/components/app-shell/phone-nudge-card";
import {
  type NavCounts,
  OwnerBrand,
  SidebarNav,
} from "@/components/app-shell/sidebar";
import {
  AvatarUserMenu,
  SidebarUserMenu,
} from "@/components/app-shell/user-menu";

/*
 * Tablet chrome, 768 to 1023px (spec "Responsive rules" D5O-0; artboards 8BW-0 top bar,
 * CW2-0 drawer open, CL4-0 owner). The AppShell renders <TabletTopBar /> for every role;
 * it is hidden on phones and from 1024 up, where the sidebar takes over.
 *
 * Top bar: academy switcher (owner: brand), account avatar and a menu button. The menu
 * button opens the full nav as a 300px drawer from the left, built from the same
 * nav config and counts as the sidebar. The drawer is a modal dialog: focus is trapped,
 * Escape and a click on the dim area close it, focus returns to the menu button, and
 * following a link closes it.
 */

function MenuIcon() {
  return (
    <svg aria-hidden="true" height="20" viewBox="0 0 20 20" width="20">
      <path
        d="M3 6h14M3 10h14M3 14h14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
      <path
        d="M4 4l8 8M12 4l-8 8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

const roundButton =
  "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

function NavDrawerContent({
  config,
  counts,
  onNavigate,
}: {
  config: ShellConfig;
  counts: NavCounts;
  onNavigate: () => void;
}) {
  const dark = config.tone === "dark";
  return (
    <DrawerContent
      backdropClassName="lg:hidden"
      className={cn(
        "w-[300px] justify-between gap-6 px-[14px] pt-4 pb-5 lg:hidden",
        dark ? "bg-ink" : "bg-fog"
      )}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between pl-[6px]">
          <DrawerTitle
            className={cn(
              "font-semibold text-[13px] uppercase leading-4 tracking-label",
              dark ? "text-[#8c8c8c]" : "text-muted"
            )}
          >
            Menu
          </DrawerTitle>
          <DrawerClose
            aria-label="Close menu"
            className={cn(
              roundButton,
              dark
                ? "border-[#333] text-white hover:bg-white/5 focus-visible:ring-white focus-visible:ring-offset-ink"
                : "border-line bg-white text-ink hover:bg-white/80 focus-visible:ring-ink focus-visible:ring-offset-fog"
            )}
          >
            <CloseIcon />
          </DrawerClose>
        </div>
        <div className="flex flex-col gap-6">
          {dark ? <OwnerBrand /> : <AcademySwitcher />}
          <SidebarNav config={config} counts={counts} onNavigate={onNavigate} />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {config.phoneNudge ? <PhoneNudgeCard /> : null}
        <SidebarUserMenu tone={config.tone} />
      </div>
    </DrawerContent>
  );
}

/** Top bar with the menu drawer, 768 to 1023px only. Rendered by AppShell. */
export function TabletTopBar({
  config,
  counts,
}: {
  config: ShellConfig;
  counts: NavCounts;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // The drawer is open only on the page it was opened on, so any navigation (a nav
  // link, switching academy, the back button) closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const onOpenChange = useCallback(
    (next: boolean) => setOpenOn(next ? pathname : null),
    [pathname]
  );
  const close = useCallback(() => setOpenOn(null), []);
  const dark = config.tone === "dark";

  return (
    <header
      className={cn(
        "sticky top-(--shell-top) z-30 flex items-center justify-between gap-4 px-6 py-3 max-md:hidden lg:hidden",
        dark ? "bg-ink" : "border-line border-b bg-white"
      )}
    >
      <div className="flex h-11 min-w-0 items-center">
        {dark ? (
          <div className="-m-[10px]">
            <OwnerBrand />
          </div>
        ) : (
          <AcademySwitcher variant="bar" />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-[10px]">
        <AvatarUserMenu tone={config.tone} />
        <Drawer onOpenChange={onOpenChange} open={open}>
          <DrawerTrigger
            aria-expanded={open}
            aria-label="Menu"
            className={cn(
              roundButton,
              dark
                ? "border-[#333] text-white hover:bg-white/5 focus-visible:ring-white focus-visible:ring-offset-ink"
                : "border-line text-ink hover:bg-fog focus-visible:ring-ink"
            )}
          >
            <MenuIcon />
          </DrawerTrigger>
          <NavDrawerContent
            config={config}
            counts={counts}
            onNavigate={close}
          />
        </Drawer>
      </div>
    </header>
  );
}
