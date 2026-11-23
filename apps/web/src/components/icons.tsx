/* Small inline icons drawn as in Paper (lucide's are slightly different). */

export function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.8"
      viewBox="0 0 16 16"
      width="16"
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 18 18"
      width="18"
    >
      <path d="M3 9h12M10 4l5 5-5 5" />
    </svg>
  );
}

export function MoreIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height="18"
      viewBox="0 0 18 18"
      width="18"
    >
      <circle cx="4" cy="9" fill="currentColor" r="1.4" />
      <circle cx="9" cy="9" fill="currentColor" r="1.4" />
      <circle cx="14" cy="9" fill="currentColor" r="1.4" />
    </svg>
  );
}
