import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

/**
 * Status pills and role badges.
 * - neutral: "Student", "Active", "Joined 2 Nov"
 * - ink: "Admin · Coach", "Yes"
 * - outline: "Coach"
 * - warning: "18 days", "QR replaced", "VOID"
 * - danger: "48 days", "18 days overdue" (strong)
 * - brand: counts ("4"), "Best here", "LIVE"
 * Sizes: default 13/600 (tables), sm = 12/700 uppercase tag (activity log),
 * lg = 13/600 uppercase 0.06em (marketing tags in 04 Components).
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-sans [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "bg-fog text-ink-soft",
        ink: "bg-ink text-white",
        outline: "border border-ink bg-white text-ink",
        warning: "bg-orange-soft text-orange-deep",
        danger: "bg-orange-deep text-white",
        brand: "bg-orange text-ink",
        line: "border border-line bg-white text-ink",
      },
      size: {
        default: "px-[10px] py-1 font-semibold text-[13px] leading-4",
        sm: "px-[9px] py-[3px] font-bold text-[12px] uppercase leading-4 tracking-[0.04em]",
        lg: "px-[14px] py-2 font-semibold text-[13px] uppercase leading-4 tracking-[0.06em]",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "default",
    },
  }
);

function Badge({
  className,
  variant = "neutral",
  size = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant, size }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };
