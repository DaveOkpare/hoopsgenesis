import { CountryDot } from "@hoops-genesis/ui/components/chip";
import { cn } from "@hoops-genesis/ui/lib/utils";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";

const CITIES = [
  { name: "Kigali", country: "rwanda" },
  { name: "Bengaluru", country: "india" },
  { name: "Kampala", country: "uganda" },
] as const;

const COLUMN_WIDTHS = {
  /** Sign in (62I-0). */
  default: "w-[400px]",
  /** Create account from invite (62J-0). */
  wide: "w-[420px]",
  /** Enter a join code (6WQ-0). */
  code: "w-[440px]",
  /** Confirm a join code (6WR-0). */
  confirm: "w-[460px]",
} as const;

/*
 * Sign in / create account frame (Paper "Sign in & sign up", 62I-0 / 62J-0).
 * md and up: 640px ink brand panel on the left, the page centred in a 400px (or 420px)
 * column on the right.
 * Below md: brand panel hidden; the column fills the screen with 20px sides, 16px top and
 * 36px bottom (62K-0 / 62L-0 / 62M-0, without the iOS status bar). It is a full-height flex
 * column, so a page can pin its main button to the bottom with `max-md:flex-1
 * max-md:justify-between` on its root.
 * tone="orange" paints the right side orange ("You're in", 59H-0).
 */
export function AuthLayout({
  children,
  width = "default",
  tone = "white",
}: {
  children: ReactNode;
  width?: keyof typeof COLUMN_WIDTHS;
  tone?: "white" | "orange";
}) {
  return (
    <div
      className={cn(
        "flex min-h-svh",
        tone === "orange" ? "bg-orange" : "bg-white"
      )}
    >
      <aside className="flex w-[640px] shrink-0 flex-col justify-between bg-ink p-12 max-md:hidden max-lg:w-[44%]">
        <div className="flex items-center gap-3">
          <BrandMark size={44} />
          <span className="font-semibold text-lg text-white leading-6">
            Hoops Genesis
          </span>
        </div>
        <div className="flex flex-col gap-6">
          <p className="font-display text-display-lg text-white uppercase leading-[100px] max-lg:text-display-sm max-lg:leading-[95%]">
            Show up.
            <br />
            <span className="text-orange">Get better.</span>
          </p>
          <p className="max-w-[440px] text-lg text-white/72 leading-[27px]">
            Training, attendance, fees and results for every Hoops Genesis
            academy, in one place.
          </p>
        </div>
        <ul className="flex gap-5">
          {CITIES.map((city) => (
            <li
              className="flex items-center gap-2 text-sm text-white/72 leading-[18px]"
              key={city.name}
            >
              <CountryDot className="size-2" country={city.country} />
              {city.name}
            </li>
          ))}
        </ul>
      </aside>
      <main className="flex flex-1 items-center justify-center p-6 max-md:items-stretch max-md:px-5 max-md:pt-4 max-md:pb-[max(36px,env(safe-area-inset-bottom))]">
        <div
          className={cn(
            "flex max-w-full flex-col max-md:w-full",
            COLUMN_WIDTHS[width]
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
