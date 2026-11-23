/* Icons drawn in the student artboards (copied from the Paper SVGs). */
import type { ComponentProps } from "react";

type IconProps = Omit<ComponentProps<"svg">, "children">;

export function UploadIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      {...props}
    >
      <path
        d="M8 11V3M4.5 6.5L8 3l3.5 3.5M3 13h10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      viewBox="0 0 16 16"
      width="14"
      {...props}
    >
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function FeeIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
      {...props}
    >
      <rect
        height="13"
        rx="3"
        stroke="currentColor"
        strokeWidth="2"
        width="20"
        x="2"
        y="5.5"
      />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      viewBox="0 0 18 18"
      width="14"
      {...props}
    >
      <path
        d="M7 4l5 5-5 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      viewBox="0 0 18 18"
      width="16"
      {...props}
    >
      <path
        d="M11 4L6 9l5 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="10"
      viewBox="0 0 12 12"
      width="10"
      {...props}
    >
      <path
        d="M3 4.5l3 3 3-3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      {...props}
    >
      <path
        d="M3.5 8.2l3 3 6-6.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

/** The small green tick for "coach confirmed". */
export function TickIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="8"
      viewBox="0 0 8 8"
      width="8"
      {...props}
    >
      <path
        d="M1 4.2l2 2L7 1.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      viewBox="0 0 18 18"
      width="18"
      {...props}
    >
      <path
        d="M9 2l7.5 13h-15z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M9 7v3.5M9 12.8v.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="22"
      viewBox="0 0 18 18"
      width="22"
      {...props}
    >
      <path
        d="M4 1.8h6.5L14 5.3v10.9H4z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M7 9h4M7 12h4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}
