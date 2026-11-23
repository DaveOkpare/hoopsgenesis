/* Icons drawn as in the coach artboards (3MZ-0, 3O4-0, 3WI-0, 5KW-0, 3QV-0, 3P1-0). */

interface IconProps {
  className?: string;
  size?: number;
}

export function BackIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      viewBox="0 0 18 18"
      width={size}
    >
      <path
        d="M11 4L6 9l5 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function CloseIcon({ className, size = 12 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      viewBox="0 0 12 12"
      width={size}
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

export function DotsIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      viewBox="0 0 18 18"
      width={size}
    >
      <circle cx="4" cy="9" fill="currentColor" r="1.5" />
      <circle cx="9" cy="9" fill="currentColor" r="1.5" />
      <circle cx="14" cy="9" fill="currentColor" r="1.5" />
    </svg>
  );
}

export function TickIcon({ className, size = 18 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      viewBox="0 0 16 16"
      width={size}
    >
      <path
        d="M3.5 8.2l3 3 6-6.4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function BellIcon({ className, size = 18 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      viewBox="0 0 18 18"
      width={size}
    >
      <path
        d="M9 2.5a4.5 4.5 0 00-4.5 4.5v3L3 12.5h12L13.5 10V7A4.5 4.5 0 009 2.5zM7.5 15a1.5 1.5 0 003 0"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function RecordIcon({ className, size = 20 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      viewBox="0 0 18 18"
      width={size}
    >
      <path
        d="M4 1.8h6.5L14 5.3v10.9H4z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M7 9h4M7 12h4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function ChevronIcon({ className, size = 14 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      viewBox="0 0 18 18"
      width={size}
    >
      <path
        d="M7 4l5 5-5 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function PhoneSmallIcon({ className, size = 14 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      viewBox="0 0 18 18"
      width={size}
    >
      <rect
        fill="none"
        height="15"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
        width="9"
        x="4.5"
        y="1.5"
      />
    </svg>
  );
}
