/* Icons drawn as in the Paper join code artboards (6RV-0, 6WV-0, 6WS-0, 6WU-0). */

export function CopyIcon({ className }: { className?: string }) {
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
      <rect height="8.5" rx="2" width="8.5" x="5" y="5" />
      <path d="M3 10.5V4a1.5 1.5 0 011.5-1.5H11" strokeLinecap="round" />
    </svg>
  );
}

export function LinkIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
      width="16"
    >
      <path d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 014 4l-1 1M9 11.5l-1 1a2.8 2.8 0 01-4-4l1-1" />
    </svg>
  );
}

export function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 18 18"
      width="18"
    >
      <path d="M9 11.5V2.5M5.5 6L9 2.5 12.5 6M3.5 10v4.5a1 1 0 001 1h9a1 1 0 001-1V10" />
    </svg>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
      viewBox="0 0 24 24"
      width="24"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function ScanFrameIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.6"
      viewBox="0 0 20 20"
      width="20"
    >
      <path d="M7 3H4a1 1 0 00-1 1v3M13 3h3a1 1 0 011 1v3M7 17H4a1 1 0 01-1-1v-3M13 17h3a1 1 0 001-1v-3" />
    </svg>
  );
}

export function AlertIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="20"
      stroke="currentColor"
      viewBox="0 0 20 20"
      width="20"
    >
      <circle cx="10" cy="10" r="8" strokeWidth="1.6" />
      <path d="M10 6v5M10 13.5v.5" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.8"
      viewBox="0 0 14 14"
      width="14"
    >
      <path d="M3 3l8 8M11 3l-8 8" />
    </svg>
  );
}

/** Clock in the "Too many tries" box (9KQ-0). */
export function PausedClockIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.6"
      viewBox="0 0 20 20"
      width="20"
    >
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6v4.2l2.6 1.6" />
    </svg>
  );
}
