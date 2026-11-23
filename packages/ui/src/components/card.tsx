import { cn } from "@hoops-genesis/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

/*
 * Panels from the app screens. 20px radius, 24px padding.
 * - default: white with hairline ("Needs your attention", "Unpaid for November")
 * - fog: no border ("Your academy", owner detail panel, "Records waiting for you")
 * - ink: black ("Today's sessions", student "Next session")
 * - soft: orange-soft ("November fee", invite banner)
 * Stat tiles have their own component (stat.tsx).
 */
const cardVariants = cva("group flex flex-col rounded-[20px] p-6", {
  variants: {
    variant: {
      default: "border border-line bg-white text-ink",
      fog: "bg-fog text-ink",
      ink: "bg-ink text-white",
      soft: "bg-orange-soft text-ink",
    },
  },
  defaultVariants: { variant: "default" },
});

function Card({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"section"> & VariantProps<typeof cardVariants>) {
  return (
    <section
      className={cn(cardVariants({ variant }), className)}
      data-slot="card"
      data-variant={variant}
      {...props}
    />
  );
}

/** Title row: title/description on the left, actions (<CardAction>) on the right. */
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center justify-between gap-4 pb-3", className)}
      data-slot="card-header"
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "font-semibold text-lg leading-[22px] tracking-display",
        className
      )}
      data-slot="card-title"
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "text-muted text-sm leading-[18px] group-data-[variant=ink]:text-white/70",
        className
      )}
      data-slot="card-description"
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 items-center gap-2", className)}
      data-slot="card-action"
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col", className)}
      data-slot="card-content"
      {...props}
    />
  );
}

/** "Showing 4 of 14 · View all unpaid" row under a table. */
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-line border-t pt-[14px] text-muted text-sm leading-[18px]",
        className
      )}
      data-slot="card-footer"
      {...props}
    />
  );
}

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cardVariants,
};
