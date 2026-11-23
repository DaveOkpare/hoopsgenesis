import { cn } from "@hoops-genesis/ui/lib/utils";
import type * as React from "react";

/*
 * Empty state from "Teams / Empty state":
 * <Empty>
 *   <EmptyMediaStack><BasketballIcon /></EmptyMediaStack>
 *   <EmptyHeader>
 *     <EmptyTitle>No teams yet</EmptyTitle>
 *     <EmptyDescription>Teams decide which students…</EmptyDescription>
 *   </EmptyHeader>
 *   <Button size="lg">Create team</Button>
 * </Empty>
 */

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg border-[1.5px] border-stone border-dashed bg-white px-6 py-12 text-center",
        className
      )}
      data-slot="empty"
      {...props}
    />
  );
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col items-center gap-[10px]", className)}
      data-slot="empty-header"
      {...props}
    />
  );
}

/** Ink tile with two tilted fog cards behind it (200×140). Put a 56px icon inside. */
function EmptyMediaStack({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("relative h-[140px] w-[200px] shrink-0", className)}
      data-slot="empty-media"
      {...props}
    >
      <div className="absolute top-[30px] left-[10px] h-24 w-[110px] origin-top-left -rotate-8 rounded-md bg-fog" />
      <div className="absolute top-[18px] left-[80px] h-24 w-[110px] origin-top-left rotate-7 rounded-md bg-fog" />
      <div className="absolute top-[22px] left-[45px] flex size-[110px] items-center justify-center rounded-[18px] bg-ink">
        {children}
      </div>
    </div>
  );
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "font-display text-[44px] text-ink uppercase leading-none max-md:text-[34px]",
        className
      )}
      data-slot="empty-title"
      {...props}
    />
  );
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "max-w-[440px] text-[17px] text-muted leading-body max-md:text-[15px]",
        className
      )}
      data-slot="empty-description"
      {...props}
    />
  );
}

export { Empty, EmptyDescription, EmptyHeader, EmptyMediaStack, EmptyTitle };
