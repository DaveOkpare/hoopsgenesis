import { buttonVariants } from "@hoops-genesis/ui/components/button";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import { PageFrame } from "@/components/page-frame";

/*
 * Unknown URL, or a page whose record does not exist (an API 404).
 * "[Spec] Empty, loading and error states" (AGW-0) "Bad link": one full page, the only
 * dark one. Inside the AppShell it is an ink panel filling the main column (sidebar and
 * tab bar keep working); outside it the whole page is ink. "Go home" goes to /app,
 * which sends the person to the home for their role (or to sign in).
 */
export function NotFound() {
  return (
    <PageFrame tone="dark">
      <section
        aria-labelledby="not-found-title"
        className="flex min-h-[420px] flex-1 flex-col justify-between gap-10 rounded-lg bg-ink p-10 max-md:min-h-[360px] max-md:p-6"
      >
        <div className="flex flex-col gap-[6px]">
          <p
            aria-hidden="true"
            className="font-display text-[160px] text-orange leading-[140px] max-md:text-[96px] max-md:leading-[88px]"
          >
            404
          </p>
          <h1
            className="font-display text-[56px] text-white uppercase leading-[56px] max-md:text-[30px] max-md:leading-[30px]"
            id="not-found-title"
          >
            <span className="sr-only">404: </span>Out of bounds
          </h1>
          <p className="max-w-[440px] pt-1 text-[#bdbdbd] text-[17px] leading-body max-md:text-sm max-md:leading-5">
            This page doesn’t exist or was moved. Check the link, or go back
            home.
          </p>
        </div>
        <Link
          className={cn(
            buttonVariants({ variant: "inverse", size: "lg" }),
            "self-start max-md:self-stretch"
          )}
          to="/app"
        >
          Go home
        </Link>
      </section>
    </PageFrame>
  );
}
