import { createContext, type ReactNode, use } from "react";

import { BrandMark } from "@/components/brand-mark";

const InsideShell = createContext(false);

/** Marks content as rendered inside the signed-in AppShell (sidebar and tab bar). */
export function ShellContent({ children }: { children: ReactNode }) {
  return <InsideShell value={true}>{children}</InsideShell>;
}

/*
 * The frame for full-page states (error, not found). Inside the AppShell it only fills
 * the main column, so the sidebar and tab bar keep working. Anywhere else (public pages,
 * or a failure before the shell could render) it is a standalone page with the brand
 * mark, the same white page and side padding as the shell.
 */
export function PageFrame({ children }: { children: ReactNode }) {
  if (use(InsideShell)) {
    return <div className="flex flex-1 flex-col">{children}</div>;
  }
  return (
    <div className="flex min-h-svh flex-col gap-8 bg-white px-11 pt-9 pb-12 max-md:gap-[18px] max-md:px-5 max-md:pt-4 max-md:pb-9 md:max-lg:gap-6 md:max-lg:px-8 md:max-lg:pt-7">
      <a className="flex w-fit items-center gap-3 rounded-sm" href="/">
        <BrandMark size={36} />
        <span className="font-semibold text-base text-ink leading-5">
          Hoops Genesis
        </span>
      </a>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
