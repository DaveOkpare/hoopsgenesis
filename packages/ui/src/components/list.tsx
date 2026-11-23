import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@hoops-genesis/ui/lib/utils";
import type * as React from "react";

/*
 * Row lists from the phone designs (Unpaid fees, Needs your attention, Later today) and
 * the web cards that use the same rhythm. Use these instead of <Table> below md.
 *
 * <List>
 *   <ListLabel>U14 · 6 unpaid</ListLabel>
 *   <ListRow>
 *     <Avatar size={36}>…</Avatar>
 *     <ListRowContent>
 *       <ListRowTitle>Jean Mugisha</ListRowTitle>
 *       <ListRowDescription className="text-orange-deep">18 days overdue · RWF 30,000</ListRowDescription>
 *     </ListRowContent>
 *     <Button size="sm" variant="outline">Record</Button>
 *   </ListRow>
 * </List>
 *
 * A whole-row link: <ListRow render={<Link to="…" />}> …<ListRowChevron /></ListRow>
 */

function List({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col", className)}
      data-slot="list"
      {...props}
    />
  );
}

/** "U14 · 6 UNPAID", "NEEDS YOUR ATTENTION": 13/500, 0.08em, muted. */
function ListLabel({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      className={cn(
        "pb-1 font-medium text-[13px] text-muted uppercase leading-4 tracking-label",
        className
      )}
      data-slot="list-label"
      {...props}
    />
  );
}

function ListRow({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "flex items-center gap-3 border-line border-b py-3 text-left outline-none last:border-b-0 focus-visible:bg-fog",
          className
        ),
      },
      props
    ),
    render,
    state: { slot: "list-row" },
  });
}

function ListRowContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-w-0 flex-1 flex-col gap-[2px]", className)}
      data-slot="list-row-content"
      {...props}
    />
  );
}

function ListRowTitle({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "truncate font-semibold text-[15px] text-ink leading-5",
        className
      )}
      data-slot="list-row-title"
      {...props}
    />
  );
}

function ListRowDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-[13px] text-muted leading-4", className)}
      data-slot="list-row-description"
      {...props}
    />
  );
}

function ListRowChevron({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("shrink-0 text-muted", className)}
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M6 3l5 5-5 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export {
  List,
  ListLabel,
  ListRow,
  ListRowChevron,
  ListRowContent,
  ListRowDescription,
  ListRowTitle,
};
