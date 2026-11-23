import { cn } from "@hoops-genesis/ui/lib/utils";
import type * as React from "react";

/*
 * Page header on every app screen:
 * <PageHeader>
 *   <PageHeading>
 *     <Eyebrow>48 people · 4 teams</Eyebrow>
 *     <PageTitle>Members</PageTitle>
 *   </PageHeading>
 *   <PageActions><Button>Invite people</Button></PageActions>
 * </PageHeader>
 * Desktop: 56px Anton title, actions bottom-aligned on the right.
 * Phone: 52/50 title, eyebrow gap 4px; actions stay on the right of the title row.
 */

function PageHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "flex w-full items-end justify-between gap-4 max-md:gap-3",
        className
      )}
      data-slot="page-header"
      {...props}
    />
  );
}

function PageHeading({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-w-0 flex-col gap-2 max-md:gap-1", className)}
      data-slot="page-heading"
      {...props}
    />
  );
}

/** Small caps line (14/500, 0.08em, muted). Also used for section labels. */
function Eyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "font-medium text-muted text-sm uppercase leading-[18px] tracking-label max-md:text-[13px] max-md:leading-4",
        className
      )}
      data-slot="eyebrow"
      {...props}
    />
  );
}

function PageTitle({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      className={cn(
        "font-display text-display-sm text-ink uppercase leading-[95%] tracking-[-0.005em]",
        "max-md:text-[52px] max-md:leading-[50px] max-md:tracking-normal",
        className
      )}
      data-slot="page-title"
      {...props}
    />
  );
}

function PageActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 gap-2", className)}
      data-slot="page-actions"
      {...props}
    />
  );
}

export { Eyebrow, PageActions, PageHeader, PageHeading, PageTitle };
