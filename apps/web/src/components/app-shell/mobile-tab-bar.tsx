import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@hoops-genesis/ui/components/dialog";
import {
  List,
  ListRow,
  ListRowChevron,
  ListRowContent,
  ListRowTitle,
} from "@hoops-genesis/ui/components/list";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";

import {
  isNavItemActive,
  isTabBarHidden,
  type NavItem,
  type ShellConfig,
} from "@/components/app-shell/nav-config";
import { NavIcon } from "@/components/app-shell/nav-icons";
import type { NavCounts } from "@/components/app-shell/sidebar";

const tabClass =
  "flex shrink-0 flex-col items-center gap-1 rounded-[10px] font-medium text-[#8a8a8a] text-[11px] leading-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ink";
const activeTabClass = "font-semibold text-ink";

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

function MoreSheet({
  items,
  pathname,
  counts,
}: {
  items: NavItem[];
  pathname: string;
  counts: NavCounts;
}) {
  const active = items.some((item) => isNavItemActive(item, pathname, "tab"));
  return (
    <Dialog>
      <DialogTrigger className={cn(tabClass, "w-16", active && activeTabClass)}>
        <NavIcon name="more" variant="tab" />
        More
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>More</DialogTitle>
        </DialogHeader>
        <DialogBody className="pb-8">
          <List>
            {items.map((item) => (
              <ListRow
                aria-current={
                  isNavItemActive(item, pathname, "tab") ? "page" : undefined
                }
                key={String(item.to)}
                render={<Link to={item.to} />}
              >
                <NavIcon className="shrink-0 text-ink" name={item.icon} />
                <ListRowContent>
                  <ListRowTitle>{item.label}</ListRowTitle>
                </ListRowContent>
                {item.countKey && counts[item.countKey] ? (
                  <span className="font-semibold text-[13px] text-orange-deep leading-4">
                    {counts[item.countKey]}
                  </span>
                ) : null}
                <ListRowChevron />
              </ListRow>
            ))}
          </List>
        </DialogBody>
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
  const width = tabs.length + (showMore ? 1 : 0) > 4 ? "w-16" : "w-[72px]";
  if (isTabBarHidden(config, pathname)) {
    return null;
  }
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-line border-t bg-white px-3 pt-[10px] pb-[max(14px,env(safe-area-inset-bottom))] md:hidden"
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
