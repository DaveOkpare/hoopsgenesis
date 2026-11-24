import { cn } from "@hoops-genesis/ui/lib/utils";
import type { ReactNode } from "react";

import { ImpersonationBanner } from "@/components/app-shell/impersonation-banner";
import { MobileTabBar } from "@/components/app-shell/mobile-tab-bar";
import type { ShellConfig } from "@/components/app-shell/nav-config";
import { type NavCounts, Sidebar } from "@/components/app-shell/sidebar";
import { TabletTopBar } from "@/components/app-shell/tablet-nav";
import { OfflineBanner } from "@/components/offline";
import { ShellContent } from "@/components/page-frame";
import { useViewer } from "@/features/viewer/queries";
import { getActiveMembership } from "@/features/viewer/selectors";

/*
 * Shell for every signed-in role (template "[Template] Admin shell"; spec "Responsive
 * rules" D5O-0). Three layouts, picked by width:
 * - Desktop, lg (1024px) and up: 256px sidebar + main column. Main: 36px top (40 for
 *   coach and student), 48 bottom, 44 sides, 32 between sections.
 * - Tablet, md to lg (768 to 1023px): no sidebar. A sticky top bar (academy switcher,
 *   avatar, menu button) and the nav in a drawer (tablet-nav.tsx). Main: 28px top,
 *   48 bottom, 32 sides, 24 between sections.
 * - Phone, below md (390 designs): no sidebar or top bar; main is 16px top, 20 sides,
 *   18 between sections, and the bottom tab bar is fixed. Pages render their own header
 *   (PageHeader / MobileAcademyBar).
 * Impersonation adds the orange "Viewing as" bar and a 4px orange frame around the app.
 * The offline banner shows under it whenever the browser is offline.
 */
export function AppShell({
  config,
  counts = {},
  children,
}: {
  config: ShellConfig;
  counts?: NavCounts;
  children: ReactNode;
}) {
  const viewer = useViewer();
  const impersonating = Boolean(viewer.impersonation);
  return (
    <div
      className={cn(
        "flex min-h-svh flex-col bg-white [--shell-top:0px]",
        impersonating && "border-4 border-orange [--shell-top:52px]"
      )}
    >
      {impersonating ? <ImpersonationBanner /> : null}
      <OfflineBanner timeZone={getActiveMembership(viewer)?.academy.timezone} />
      <TabletTopBar config={config} counts={counts} />
      <div className="flex flex-1">
        <Sidebar config={config} counts={counts} />
        <main
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-8 px-11 pt-9 pb-12 max-md:gap-[18px] max-md:px-5 max-md:pt-4 max-md:pb-[110px] md:max-lg:gap-6 md:max-lg:px-8 md:max-lg:pt-7",
            config.roomyTop && "pt-10 max-md:pt-4 md:max-lg:pt-7"
          )}
          id="main"
        >
          <ShellContent>{children}</ShellContent>
        </main>
      </div>
      <MobileTabBar config={config} counts={counts} />
    </div>
  );
}
