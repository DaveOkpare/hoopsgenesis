import { cn } from "@hoops-genesis/ui/lib/utils";
import type { ComponentProps } from "react";

/*
 * Small pieces shared by the sign-in, invite and reset-password screens
 * (Paper "Sign in & sign up", 62I-0 to 62M-0; 59H-0 / 5BQ-0).
 */

/** Big Anton page title; phone sizes vary per artboard, pass them in `className`. */
export function AuthTitle({ className, ...props }: ComponentProps<"h1">) {
  return (
    <h1
      className={cn(
        "font-display text-display-sm text-ink uppercase leading-[54px]",
        className
      )}
      {...props}
    />
  );
}

/** Full-width 56px pill (58px on phone) with a 17px label, as on every auth artboard. */
export const authSubmitClass =
  "w-full text-[17px] leading-[22px] max-md:py-[18px]";

/** Underlined inline link: "Forgot password?", "Sign in to accept", "Send again". */
export const authLinkClass =
  "rounded-sm font-semibold text-ink underline decoration-1 outline-none [text-underline-position:from-font] hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2";

/*
 * Field looks. The shared Input is a fog field with a 2px transparent border; these keep
 * its 52px height but draw the 1px line border from the designs until focus.
 */
const lineBorder =
  "border border-line py-[15px] focus-visible:border-2 focus-visible:py-3.5 aria-invalid:border-2 aria-invalid:py-3.5";

/** Fog field with a line border (sign-in password, 62I-0). */
export const fogFieldClass = lineBorder;

/** White field with a line border and light placeholder (invite password, 62J-0). */
export const whiteFieldClass = cn(
  lineBorder,
  "bg-white placeholder:text-[#B5B5B5]"
);

/** Read-only fog field (email locked by the invite, 62J-0): 48px, no border. */
export const lockedFieldClass =
  "cursor-default py-3 text-ink-soft focus-visible:border-transparent focus-visible:bg-fog";

/* Icons drawn as in Paper. */

export function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="18"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 18 18"
      width="18"
    >
      <path d="M1.5 9S4.5 3.5 9 3.5 16.5 9 16.5 9 13.5 14.5 9 14.5 1.5 9 1.5 9z" />
      <circle cx="9" cy="9" r="2.3" />
    </svg>
  );
}

export function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.5"
      viewBox="0 0 18 18"
      width="18"
    >
      <path d="M1.5 9S4.5 3.5 9 3.5 16.5 9 16.5 9 13.5 14.5 9 14.5 1.5 9 1.5 9z" />
      <circle cx="9" cy="9" r="2.3" />
      <path d="M2.5 2.5l13 13" />
    </svg>
  );
}

export function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="16"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
      width="16"
    >
      <rect height="7" rx="1.5" width="10" x="3" y="7" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </svg>
  );
}

export function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 16 16"
      width="16"
    >
      <path d="M10 3L5 8l5 5" />
    </svg>
  );
}

export function MailIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="28"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="28"
    >
      <rect height="14" rx="3" width="18" x="3" y="5" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

export function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="30"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.6"
      viewBox="0 0 18 18"
      width="30"
    >
      <circle cx="9" cy="9" r="7" />
      <path d="M9 5v4l2.5 2" />
    </svg>
  );
}

/** 64px orange-soft disc holding a deep-orange icon (62M-0, 5BQ-0). */
export function AuthIconDisc({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex size-16 shrink-0 items-center justify-center rounded-full bg-orange-soft text-orange-deep",
        className
      )}
      {...props}
    />
  );
}
