import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { Fragment } from "react";

import { AcademySwitcher } from "@/components/app-shell/academy-switcher";
import {
  isNavItemActive,
  type NavCountKey,
  type NavItem,
  type ShellConfig,
} from "@/components/app-shell/nav-config";
import { NavIcon } from "@/components/app-shell/nav-icons";
import { PhoneNudgeCard } from "@/components/app-shell/phone-nudge-card";
import { SidebarUserMenu } from "@/components/app-shell/user-menu";
import { BrandMark } from "@/components/brand-mark";

export type NavCounts = Partial<Record<NavCountKey, number>>;

/** Owner console brand ("Hoops Genesis / OWNER"): dark sidebar, tablet top bar and drawer. */
export function OwnerBrand() {
  return (
    <div className="flex items-center gap-[10px] p-[10px]">
      <BrandMark size={36} />
      <div className="flex flex-col">
        <span className="font-semibold text-[15px] text-white leading-[18px]">
          Hoops Genesis
        </span>
        <span className="font-semibold text-[12px] text-orange uppercase leading-4 tracking-label">
          Owner
        </span>
      </div>
    </div>
  );
}

function SidebarLink({
  item,
  active,
  count,
  dark,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  count?: number;
  dark: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-[10px] px-3 py-[10px] font-medium text-[15px] leading-[18px] outline-none transition-colors focus-visible:ring-2",
        dark
          ? "text-[#bdbdbd] hover:bg-white/5 focus-visible:ring-white"
          : "text-ink-soft hover:bg-white/60 focus-visible:ring-ink",
        active &&
          (dark
            ? "bg-[#262626] font-semibold text-white hover:bg-[#262626]"
            : "bg-white font-semibold text-ink shadow-[0_1px_2px_#1111110f] hover:bg-white")
      )}
      onClick={onNavigate}
      to={item.to}
    >
      <NavIcon className="shrink-0" name={item.icon} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {count ? (
        <span
          className={cn(
            "flex w-7 shrink-0 justify-end text-[13px] leading-4",
            dark ? "text-[#8c8c8c]" : "font-semibold text-orange-deep"
          )}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The role's nav list, shared by the desktop sidebar and the tablet drawer.
 * `onNavigate` runs when a link is followed (the drawer closes itself with it).
 */
export function SidebarNav({
  config,
  counts,
  onNavigate,
}: {
  config: ShellConfig;
  counts: NavCounts;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const dark = config.tone === "dark";
  return (
    <nav aria-label="Main">
      <ul className="flex flex-col gap-[2px]">
        {config.nav.map((item) => (
          <Fragment key={String(item.to)}>
            {item.dividerBefore ? (
              <li
                aria-hidden="true"
                className={cn("h-px", dark ? "bg-[#262626]" : "bg-line")}
              />
            ) : null}
            <li>
              <SidebarLink
                active={isNavItemActive(item, pathname)}
                count={item.countKey ? counts[item.countKey] : undefined}
                dark={dark}
                item={item}
                onNavigate={onNavigate}
              />
            </li>
          </Fragment>
        ))}
      </ul>
    </nav>
  );
}

/*
 * Desktop sidebar: 1024px and up (Tailwind `lg`). From 768 to 1023 the tablet top bar
 * and menu drawer take its place (spec "Responsive rules" D5O-0).
 * Light = fog with academy switcher; dark = owner console.
 */
export function Sidebar({
  config,
  counts,
}: {
  config: ShellConfig;
  counts: NavCounts;
}) {
  const dark = config.tone === "dark";
  return (
    <aside
      aria-label="Sidebar"
      className={cn(
        "sticky top-(--shell-top) flex h-[calc(100svh-var(--shell-top))] w-[256px] shrink-0 flex-col justify-between gap-6 overflow-y-auto px-[14px] py-5 max-lg:hidden",
        dark ? "bg-ink" : "border-line border-r bg-fog"
      )}
    >
      <div className="flex flex-col gap-6">
        {dark ? <OwnerBrand /> : <AcademySwitcher />}
        <SidebarNav config={config} counts={counts} />
      </div>
      <div className="flex flex-col gap-3">
        {config.phoneNudge ? <PhoneNudgeCard /> : null}
        <SidebarUserMenu tone={config.tone} />
      </div>
    </aside>
  );
}
