import { cn } from "@hoops-genesis/ui/lib/utils";
import type { ReactNode } from "react";

import { ImpersonationBanner } from "@/components/app-shell/impersonation-banner";
import { MobileTabBar } from "@/components/app-shell/mobile-tab-bar";
import type { ShellConfig } from "@/components/app-shell/nav-config";
import { type NavCounts, Sidebar } from "@/components/app-shell/sidebar";
import { useViewer } from "@/features/viewer/queries";

/*
 * Shell for every signed-in role (template "[Template] Admin shell").
 * md and up: 256px sidebar + main column (36/48 top/bottom, 44 sides; 24 sides below lg).
 * Below md (phones, 390 designs): no sidebar; main is 20px side padding and the bottom
 * tab bar is fixed. Pages render their own header (PageHeader / MobileAcademyBar).
 * Impersonation adds the orange "Viewing as" bar and a 4px orange frame around the app.
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
      <div className="flex flex-1">
        <Sidebar config={config} counts={counts} />
        <main
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-8 px-11 pt-9 pb-12 max-md:gap-[18px] max-md:px-5 max-md:pt-4 max-md:pb-[110px] max-lg:px-6",
            config.roomyTop && "pt-10 max-md:pt-4"
          )}
          id="main"
        >
          {children}
        </main>
      </div>
      <MobileTabBar config={config} counts={counts} />
    </div>
  );
}
