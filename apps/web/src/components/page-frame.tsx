import { cn } from "@hoops-genesis/ui/lib/utils";
import { createContext, type ReactNode, use } from "react";

import { BrandMark } from "@/components/brand-mark";

const InsideShell = createContext(false);

/** Marks content as rendered inside the signed-in AppShell (sidebar and tab bar). */
export function ShellContent({ children }: { children: ReactNode }) {
  return <InsideShell value={true}>{children}</InsideShell>;
}

/** True inside the signed-in AppShell (state components size themselves by it). */
export function useInsideShell(): boolean {
  return use(InsideShell);
}

/*
 * The frame for full-page states (error, not found). Inside the AppShell it only fills
 * the main column, so the sidebar and tab bar keep working. Anywhere else (public pages,
 * or a failure before the shell could render) it is a standalone page with the brand
 * mark, the same page padding as the shell (phone / tablet / desktop).
 * tone="dark" is the ink page used by "not found" outside the shell.
 */
export function PageFrame({
  children,
  tone = "light",
}: {
  children: ReactNode;
  tone?: "light" | "dark";
}) {
  if (use(InsideShell)) {
    return <div className="flex flex-1 flex-col">{children}</div>;
  }
  const dark = tone === "dark";
  return (
    <div
      className={cn(
        "flex min-h-svh flex-col gap-8 px-11 pt-9 pb-12 max-md:gap-[18px] max-md:px-5 max-md:pt-4 max-md:pb-9 md:max-lg:gap-6 md:max-lg:px-8 md:max-lg:pt-7",
        dark ? "bg-ink" : "bg-white"
      )}
    >
      <a
        className={cn(
          "flex w-fit items-center gap-3 rounded-sm outline-none focus-visible:ring-2",
          dark ? "focus-visible:ring-white" : "focus-visible:ring-ink"
        )}
        href="/"
      >
        <BrandMark size={36} />
        <span
          className={cn(
            "font-semibold text-base leading-5",
            dark ? "text-white" : "text-ink"
          )}
        >
          Hoops Genesis
        </span>
      </a>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
