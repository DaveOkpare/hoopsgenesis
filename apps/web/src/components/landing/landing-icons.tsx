/* Custom SVGs copied from the Paper landing artboards (p-2-0). */

export function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height="18"
      viewBox="0 0 18 18"
      width="18"
    >
      <path
        d="M3 9h12M10 4l5 5-5 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function MenuIcon() {
  return (
    <svg aria-hidden="true" height="14" viewBox="0 0 18 14" width="18">
      <path
        d="M1 1h16M1 7h16M1 13h16"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg aria-hidden="true" height="14" viewBox="0 0 14 14" width="14">
      <path
        d="M2 2l10 10M12 2L2 12"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height="14"
      viewBox="0 0 14 14"
      width="14"
    >
      <path
        d="M3 5l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function BasketballIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height="72"
      viewBox="0 0 72 72"
      width="72"
    >
      <circle cx="36" cy="36" fill="#EB7724" r="34" />
      <path
        d="M2 36h68M36 2v68M12 12c10 10 10 38 0 48M60 12c-10 10-10 38 0 48"
        fill="none"
        stroke="#111111"
        strokeWidth="2.5"
      />
    </svg>
  );
}

export function FootballIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height="72"
      viewBox="0 0 72 72"
      width="72"
    >
      <circle
        cx="36"
        cy="36"
        fill="#FFFFFF"
        r="34"
        stroke="#111111"
        strokeWidth="2.5"
      />
      <path d="M36 22l12 9-5 14H29l-5-14z" fill="#111111" />
    </svg>
  );
}
