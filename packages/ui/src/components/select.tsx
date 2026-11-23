"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { CheckIcon } from "lucide-react";
import type * as React from "react";

const Select = SelectPrimitive.Root;

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      className={cn("scroll-my-1", className)}
      data-slot="select-group"
      {...props}
    />
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      className={cn("flex min-w-0 flex-1 truncate text-left", className)}
      data-slot="select-value"
      {...props}
    />
  );
}

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      height="12"
      viewBox="0 0 12 12"
      width="12"
    >
      <path
        d="M3 4.5l3 3 3-3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

const triggerVariants = {
  /** Fog form field, same box as <Input>. */
  field:
    "w-full rounded-[14px] border-2 border-transparent bg-fog px-[14px] py-3 text-[15px] leading-[18px] focus-visible:border-ink focus-visible:bg-white data-popup-open:border-ink data-popup-open:bg-white",
  /** Outline pill used in toolbars ("All teams", "November 2026", "Person Anyone"). */
  pill: "w-fit rounded-full border border-line bg-white px-[14px] py-[9px] font-medium text-sm leading-[18px] hover:bg-fog focus-visible:ring-2 focus-visible:ring-ink data-popup-open:bg-fog",
} as const;

function SelectTrigger({
  className,
  variant = "field",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & { variant?: keyof typeof triggerVariants }) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "flex cursor-pointer select-none items-center justify-between gap-2 whitespace-nowrap text-ink outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-orange-deep data-placeholder:text-muted",
        triggerVariants[variant],
        className
      )}
      data-slot="select-trigger"
      data-variant={variant}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="text-ink" render={<Chevron />} />
    </SelectPrimitive.Trigger>
  );
}

/** Popup shared by Select, DropdownMenu and Popover: white, 16px radius, soft shadow. */
const popupSurface =
  "rounded-md border border-line bg-white p-2 text-ink shadow-[0_16px_40px_#11111124] outline-none";

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  alignItemWithTrigger = false,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        alignOffset={alignOffset}
        className="isolate z-50"
        side={side}
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          className={cn(
            popupSurface,
            "data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 relative max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto duration-100 data-closed:animate-out data-open:animate-in",
            className
          )}
          data-slot="select-content"
          {...props}
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      className={cn(
        "px-[10px] pt-2 pb-[6px] font-semibold text-[12px] text-muted uppercase leading-4 tracking-label",
        className
      )}
      data-slot="select-label"
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex w-full cursor-default select-none items-center gap-2 rounded-[10px] py-2 pr-8 pl-[10px] font-medium text-sm leading-[18px] outline-hidden data-disabled:pointer-events-none data-highlighted:bg-fog data-disabled:opacity-50",
        className
      )}
      data-slot="select-item"
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-[10px] flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      className={cn("pointer-events-none my-1 h-px bg-line", className)}
      data-slot="select-separator"
      {...props}
    />
  );
}

/** Muted prefix inside a pill trigger: <SelectPrefix>Person</SelectPrefix><SelectValue /> */
function SelectPrefix({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("font-regular text-muted", className)}
      data-slot="select-prefix"
      {...props}
    />
  );
}

export {
  popupSurface,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectPrefix,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
