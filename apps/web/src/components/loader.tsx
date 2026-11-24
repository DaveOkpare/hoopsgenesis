import { SkeletonList } from "@hoops-genesis/ui/components/skeleton";

import { BrandMark } from "@/components/brand-mark";
import { useInsideShell } from "@/components/page-frame";

/*
 * The router's default pending component ("[Spec] Empty, loading and error states"
 * AGW-0: grey shapes, no spinners on full pages).
 * - Inside the AppShell (a page is loading): a header placeholder and list rows in the
 *   main column; the sidebar, top bar and tab bar stay usable.
 * - Outside it (the app itself is starting, before the session is known): a white page
 *   with the brand mark breathing in the middle.
 * Pages that know their own shape render their own skeletons
 * (@hoops-genesis/ui/components/skeleton) instead of relying on this.
 */
export default function Loader() {
  const insideShell = useInsideShell();
  if (!insideShell) {
    return (
      <output
        aria-label="Loading"
        className="flex min-h-svh items-center justify-center bg-white"
      >
        <BrandMark className="animate-pulse" size={44} />
      </output>
    );
  }
  return (
    <div aria-busy="true" className="flex flex-col gap-6 max-md:gap-[18px]">
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="h-3 w-40 animate-pulse rounded-[6px] bg-[#f2f2ef]" />
        <div className="h-11 w-72 max-w-full animate-pulse rounded-sm bg-[#ececE9] max-md:h-9" />
      </div>
      <SkeletonList label="Loading page" rows={6} trailing />
    </div>
  );
}
