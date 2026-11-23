"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Button } from "@hoops-genesis/ui/components/button";
import { cn } from "@hoops-genesis/ui/lib/utils";
import type * as React from "react";

/*
 * One dialog, three presentations:
 * - md and up: centred modal (Invite people, Record payment, Void payment on web).
 * - below md, mobile="sheet" (default): bottom sheet with a grabber
 *   (Cancel a session, Check a student in by hand on phone).
 * - below md, mobile="fullscreen": full-screen task page with an X on the left and a
 *   centred 17px title (Record payment, Invite people on phone).
 *
 * <Dialog>
 *   <DialogTrigger render={<Button />}>Invite people</DialogTrigger>
 *   <DialogContent mobile="fullscreen">
 *     <DialogHeader>
 *       <DialogTitle>Invite people</DialogTitle>
 *       <DialogDescription>Each email gets its own invite link.</DialogDescription>
 *     </DialogHeader>
 *     <DialogBody>...fields...</DialogBody>
 *     <DialogFooter>
 *       <DialogFooterNote>2 invites will be sent</DialogFooterNote>
 *       <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
 *       <Button>Send 2 invites</Button>
 *     </DialogFooter>
 *   </DialogContent>
 * </Dialog>
 */

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      className={cn(
        "data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 isolate z-50 bg-[#11111166] duration-150 data-closed:animate-out data-open:animate-in md:bg-[#11111173]",
        className
      )}
      data-slot="dialog-overlay"
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  mobile = "sheet",
  ...props
}: DialogPrimitive.Popup.Props & { mobile?: "sheet" | "fullscreen" }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        className={cn(
          "group/dialog fixed z-50 flex flex-col bg-white text-ink outline-none duration-200",
          // Desktop: centred card.
          "md:data-closed:fade-out-0 md:data-open:fade-in-0 md:data-closed:zoom-out-95 md:data-open:zoom-in-95 md:top-1/2 md:left-1/2 md:max-h-[calc(100dvh-4rem)] md:w-[calc(100%-2rem)] md:max-w-[520px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:shadow-[0_24px_60px_#11111140] md:data-closed:animate-out md:data-open:animate-in",
          // Phone: bottom sheet ...
          "max-md:data-closed:slide-out-to-bottom max-md:data-open:slide-in-from-bottom max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[calc(100dvh-24px)] max-md:rounded-t-[28px] max-md:data-closed:animate-out max-md:data-open:animate-in",
          // ... or a full-screen page.
          "max-md:data-[mobile=fullscreen]:top-0 max-md:data-[mobile=fullscreen]:max-h-none max-md:data-[mobile=fullscreen]:rounded-none",
          className
        )}
        data-mobile={mobile}
        data-slot="dialog-content"
        {...props}
      >
        <div
          aria-hidden="true"
          className="mx-auto mt-3 h-[5px] w-10 shrink-0 rounded-full bg-line group-data-[mobile=fullscreen]/dialog:hidden md:hidden"
        />
        {children}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-3 max-md:size-3.5"
      viewBox="0 0 12 12"
    >
      <path
        d="M2 2l8 8M10 2L2 10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function DialogHeader({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<"div"> & { showCloseButton?: boolean }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-start gap-4 px-7 pt-7 pb-2",
        "max-md:px-5 max-md:pt-5",
        "max-md:group-data-[mobile=fullscreen]/dialog:items-center max-md:group-data-[mobile=fullscreen]/dialog:pt-4 max-md:group-data-[mobile=fullscreen]/dialog:pb-3",
        className
      )}
      data-slot="dialog-header"
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-[6px] max-md:group-data-[mobile=fullscreen]/dialog:items-center">
        {children}
      </div>
      {showCloseButton ? (
        <DialogPrimitive.Close
          aria-label="Close"
          className="max-md:group-data-[mobile=fullscreen]/dialog:order-first max-md:group-data-[mobile=sheet]/dialog:hidden"
          data-slot="dialog-close"
          render={<Button size="icon" variant="secondary" />}
        >
          <CloseIcon />
        </DialogPrimitive.Close>
      ) : null}
      {showCloseButton ? (
        <span
          aria-hidden="true"
          className="hidden size-9 shrink-0 max-md:group-data-[mobile=fullscreen]/dialog:block"
        />
      ) : null}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      className={cn(
        "font-display text-[36px] text-ink uppercase leading-none",
        "max-md:text-[34px] max-md:leading-[36px]",
        "max-md:group-data-[mobile=fullscreen]/dialog:text-center max-md:group-data-[mobile=fullscreen]/dialog:font-sans max-md:group-data-[mobile=fullscreen]/dialog:font-semibold max-md:group-data-[mobile=fullscreen]/dialog:text-[17px] max-md:group-data-[mobile=fullscreen]/dialog:normal-case max-md:group-data-[mobile=fullscreen]/dialog:leading-[22px]",
        className
      )}
      data-slot="dialog-title"
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      className={cn(
        "text-[15px] text-muted leading-[18px] max-md:leading-5 max-md:group-data-[mobile=fullscreen]/dialog:sr-only",
        className
      )}
      data-slot="dialog-description"
      {...props}
    />
  );
}

/** Scrollable middle. Grows to push the footer down on full-screen phones. */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-4 overflow-y-auto px-7 pt-5 pb-6 max-md:flex-1 max-md:px-5 max-md:pt-3",
        className
      )}
      data-slot="dialog-body"
      {...props}
    />
  );
}

/**
 * Desktop: right-aligned buttons over a hairline.
 * Phone: stacked full-width 56px buttons, primary (last child) on top, note at the bottom.
 */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-end gap-2 border-line border-t px-7 py-[18px]",
        "max-md:flex-col-reverse max-md:items-stretch max-md:gap-[10px] max-md:border-0 max-md:px-5 max-md:pt-2 max-md:pb-[max(24px,env(safe-area-inset-bottom))]",
        "max-md:*:data-[slot=button]:w-full max-md:*:data-[slot=button]:py-[17px] max-md:*:data-[slot=button]:text-[17px] max-md:*:data-[slot=button]:leading-[22px]",
        className
      )}
      data-slot="dialog-footer"
      {...props}
    />
  );
}

/** Left-hand note in the footer ("2 invites will be sent"); centred under the buttons on phones. */
function DialogFooterNote({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "mr-auto text-muted text-sm leading-[18px] max-md:order-first max-md:mr-0 max-md:text-center max-md:text-[13px]",
        className
      )}
      data-slot="dialog-footer-note"
      {...props}
    />
  );
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogFooterNote,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
