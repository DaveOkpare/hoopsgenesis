"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Toasts in the brand style: white card, 14px radius, ink text, soft shadow.
 * Light theme only. Call `toast.success("Payment saved")` from "sonner".
 */
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    className="toaster group"
    icons={{
      success: <CircleCheckIcon className="size-[18px] text-success" />,
      info: <InfoIcon className="size-[18px] text-ink" />,
      warning: <TriangleAlertIcon className="size-[18px] text-orange-deep" />,
      error: <OctagonXIcon className="size-[18px] text-orange-deep" />,
      loading: <Loader2Icon className="size-[18px] animate-spin text-muted" />,
    }}
    theme="light"
    toastOptions={{
      classNames: {
        toast:
          "!rounded-[14px] !border !border-line !bg-white !px-4 !py-[14px] !font-sans !text-ink !shadow-[0_16px_40px_#11111124] !gap-3",
        title: "!text-[15px] !font-semibold !leading-[18px]",
        description: "!text-sm !leading-[18px] !text-muted",
        actionButton:
          "!rounded-full !bg-ink !px-[14px] !py-[7px] !text-sm !font-semibold !text-white !h-auto",
        cancelButton:
          "!rounded-full !bg-fog !px-[14px] !py-[7px] !text-sm !font-semibold !text-ink !h-auto",
      },
    }}
    {...props}
  />
);

export { Toaster };
