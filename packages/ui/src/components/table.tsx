import { cn } from "@hoops-genesis/ui/lib/utils";
import type * as React from "react";

/*
 * Data table from the admin screens (Members, Fees, Unpaid, Activity log).
 * Cells have no horizontal padding: set column widths on <TableHead>
 * (e.g. className="w-[140px]") the way Paper does. Header has a hairline under it;
 * add `border-t` on <TableHeader> when the table sits inside a card (Dashboard).
 * Below md, swap tables for <List>/<ListRow> (see list.tsx), as the phone designs do.
 */

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      className="relative w-full overflow-x-auto"
      data-slot="table-container"
    >
      <table
        className={cn("w-full caption-bottom text-left font-sans", className)}
        data-slot="table"
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      className={cn("border-line border-b", className)}
      data-slot="table-header"
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn(className)} data-slot="table-body" {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot className={cn(className)} data-slot="table-footer" {...props} />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-line border-b data-[state=selected]:bg-fog data-[state=voided]:bg-[#fafaf9]",
        className
      )}
      data-slot="table-row"
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "whitespace-nowrap py-[10px] text-left align-middle font-semibold text-[13px] text-muted uppercase leading-4 tracking-[0.04em]",
        className
      )}
      data-slot="table-head"
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn(
        "py-[14px] align-middle text-[15px] text-ink-soft leading-[18px]",
        className
      )}
      data-slot="table-cell"
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      className={cn("mt-4 text-muted text-sm", className)}
      data-slot="table-caption"
      {...props}
    />
  );
}

/** Trailing "···" column (48px) used on every admin table row. */
function TableActionsHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th className={cn("w-12", className)} data-slot="table-head" {...props}>
      <span className="sr-only">Actions</span>
    </th>
  );
}

export {
  Table,
  TableActionsHead,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
};
