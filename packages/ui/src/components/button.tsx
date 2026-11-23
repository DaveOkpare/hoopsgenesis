import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

/**
 * Pill buttons from "04 — Components" and the app screens.
 * Ink is the default primary; `brand` (orange) is for the single most important
 * action on a page; orange buttons always use ink labels.
 * Outline variants carry a 1px border on top of the padding, exactly like Paper.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-sans font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:pointer-events-none aria-invalid:ring-2 aria-invalid:ring-orange-deep [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-ink text-white hover:bg-ink/85 disabled:bg-stone disabled:text-[#8a8a8a]",
        outline:
          "border border-line bg-white text-ink hover:bg-fog disabled:opacity-50 aria-expanded:bg-fog",
        secondary:
          "bg-fog text-ink hover:bg-stone/60 disabled:opacity-50 aria-expanded:bg-stone/60",
        ghost: "text-ink hover:bg-fog disabled:opacity-50 aria-expanded:bg-fog",
        brand:
          "bg-orange text-ink hover:bg-orange/90 disabled:bg-stone disabled:text-[#8a8a8a]",
        destructive:
          "bg-orange-deep text-white hover:bg-orange-deep/90 focus-visible:ring-orange-deep disabled:bg-stone disabled:text-[#8a8a8a]",
        "destructive-outline":
          "border border-orange-deep bg-white text-orange-deep hover:bg-orange-soft focus-visible:ring-orange-deep disabled:opacity-50",
        inverse:
          "bg-white text-ink hover:bg-white/90 focus-visible:ring-white disabled:opacity-50",
        "inverse-outline":
          "border border-[#3a3a3a] text-white hover:bg-white/10 focus-visible:ring-white disabled:opacity-50",
        link: "rounded-none text-ink underline decoration-1 underline-offset-[3px] hover:decoration-2 disabled:opacity-50",
      },
      size: {
        xs: "px-[14px] py-[7px] text-sm leading-[18px]",
        sm: "px-4 py-[9px] text-sm leading-[18px]",
        toolbar:
          "px-[14px] py-[9px] font-medium text-sm leading-[18px] [&_svg:not([class*='size-'])]:size-3",
        default: "px-5 py-[13px] text-[15px] leading-[18px]",
        lg: "px-[26px] py-[15px] text-base leading-5",
        xl: "px-6 py-[17px] text-lg leading-[22px] [&_svg:not([class*='size-'])]:size-[18px]",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto p-0" }],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      className={cn(buttonVariants({ variant, size, className }))}
      data-slot="button"
      {...props}
    />
  );
}

export { Button, buttonVariants };
