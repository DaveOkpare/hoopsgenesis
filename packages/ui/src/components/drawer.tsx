"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@hoops-genesis/ui/lib/utils";

/*
 * Side drawer: a modal panel that slides in from the left over a dimmed page (the tablet
 * menu, "[Admin · Tablet] Menu drawer open"). Built on the Base UI dialog, so focus is
 * trapped inside, Escape and a click on the dim area close it, and focus goes back to
 * the trigger. Give it a DrawerTitle so screen readers can name it.
 *
 * <Drawer open={open} onOpenChange={setOpen}>
 *   <DrawerTrigger aria-label="Menu">…</DrawerTrigger>
 *   <DrawerContent className="w-[300px] bg-fog">
 *     <DrawerTitle>Menu</DrawerTitle>
 *     <DrawerClose aria-label="Close menu">…</DrawerClose>
 *     …
 *   </DrawerContent>
 * </Drawer>
 */

function Drawer(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerTitle(props: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="drawer-title" {...props} />;
}

const SIDE_CLASSES = {
  left: "data-closed:slide-out-to-left data-open:slide-in-from-left left-0 shadow-[12px_0_40px_#1111112e]",
  /* A right-hand detail panel (e.g. "[Admin · Web] Payment detail panel"). */
  right:
    "data-closed:slide-out-to-right data-open:slide-in-from-right right-0 shadow-[-8px_0_32px_#1111111f]",
} as const;

function DrawerContent({
  className,
  backdropClassName,
  side = "left",
  ...props
}: DialogPrimitive.Popup.Props & {
  backdropClassName?: string;
  side?: keyof typeof SIDE_CLASSES;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={cn(
          "data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-50 bg-[#11111166] duration-200 data-closed:animate-out data-open:animate-in",
          backdropClassName
        )}
        data-slot="drawer-overlay"
      />
      <DialogPrimitive.Popup
        className={cn(
          "fixed inset-y-0 z-50 flex max-w-[calc(100vw-48px)] flex-col overflow-y-auto outline-none duration-200 data-closed:animate-out data-open:animate-in",
          SIDE_CLASSES[side],
          className
        )}
        data-slot="drawer-content"
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}

export { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger };
