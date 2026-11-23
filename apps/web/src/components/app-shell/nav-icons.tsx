/*
 * Navigation icons, drawn exactly as in Paper. Each icon has the 18px sidebar version
 * (stroke 1.6) and, where the phone designs have one, the 24px tab-bar version (stroke 2).
 * Icons without a phone version scale the 18px drawing.
 */
import type { ReactNode } from "react";

export type NavIconName =
  | "academies"
  | "activity"
  | "attendance"
  | "calendar"
  | "dashboard"
  | "fees"
  | "home"
  | "members"
  | "more"
  | "progress"
  | "qr"
  | "records"
  | "settings"
  | "teams"
  | "today";

const round = { strokeLinecap: "round", strokeLinejoin: "round" } as const;

const sidebarPaths: Record<NavIconName, ReactNode> = {
  dashboard: (
    <>
      <rect height="6" rx="1.5" width="6" x="2" y="2" />
      <rect height="6" rx="1.5" width="6" x="10" y="2" />
      <rect height="6" rx="1.5" width="6" x="2" y="10" />
      <rect height="6" rx="1.5" width="6" x="10" y="10" />
    </>
  ),
  calendar: (
    <>
      <rect height="12.5" rx="2" width="14" x="2" y="3.5" />
      <path d="M2 7.5h14M6 2v3M12 2v3" {...round} />
    </>
  ),
  teams: (
    <>
      <circle cx="9" cy="9" r="7" />
      <path
        d="M2 9h14M9 2v14M4 4c2.5 2.5 2.5 7.5 0 10M14 4c-2.5 2.5-2.5 7.5 0 10"
        strokeWidth="1.3"
      />
    </>
  ),
  members: (
    <>
      <circle cx="7" cy="6" r="3" />
      <path
        d="M1.5 16c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M12 3.2a3 3 0 010 5.6M14 11.8c1.4.6 2.3 2 2.5 4.2"
        {...round}
      />
    </>
  ),
  attendance: (
    <>
      <rect height="14" rx="3" width="14" x="2" y="2" />
      <path d="M5.5 9.2l2.3 2.3 4.7-5" {...round} />
    </>
  ),
  fees: (
    <>
      <rect height="10" rx="2" width="15" x="1.5" y="4" />
      <circle cx="9" cy="9" r="2" />
    </>
  ),
  records: (
    <>
      <path d="M4 1.8h6.5L14 5.3v10.9H4z" strokeLinejoin="round" />
      <path d="M7 9h4M7 12h4" {...round} />
    </>
  ),
  qr: (
    <>
      <rect height="5.5" rx="1" width="5.5" x="2" y="2" />
      <rect height="5.5" rx="1" width="5.5" x="10.5" y="2" />
      <rect height="5.5" rx="1" width="5.5" x="2" y="10.5" />
      <path d="M10.5 10.5h2v2M16 10.5v5.5h-5.5" />
    </>
  ),
  activity: (
    <>
      <circle cx="9" cy="9" r="7" />
      <path d="M9 5v4l2.5 2" {...round} />
    </>
  ),
  today: (
    <>
      <circle cx="9" cy="9" r="7" />
      <path d="M9 5v4l2.5 2" {...round} />
    </>
  ),
  settings: (
    <>
      <circle cx="9" cy="9" r="2.5" />
      <path
        d="M9 1.5v2.2M9 14.3v2.2M1.5 9h2.2M14.3 9h2.2M3.7 3.7l1.6 1.6M12.7 12.7l1.6 1.6M3.7 14.3l1.6-1.6M12.7 5.3l1.6-1.6"
        {...round}
      />
    </>
  ),
  home: (
    <path
      d="M2.5 8L9 2.5 15.5 8v7.5h-4.5v-4.5h-4v4.5H2.5z"
      strokeLinejoin="round"
    />
  ),
  academies: (
    <path d="M2 16V7l7-4.5L16 7v9M6 16v-5h6v5" strokeLinejoin="round" />
  ),
  progress: <path d="M2 15.5h14M3.5 12l4-4 3 3 5-6" {...round} />,
  more: (
    <>
      <circle cx="3.75" cy="9" fill="currentColor" r="1.35" stroke="none" />
      <circle cx="9" cy="9" fill="currentColor" r="1.35" stroke="none" />
      <circle cx="14.25" cy="9" fill="currentColor" r="1.35" stroke="none" />
    </>
  ),
};

const tabPaths: Partial<Record<NavIconName, ReactNode>> = {
  dashboard: (
    <>
      <rect height="8" rx="2" width="8" x="3" y="3" />
      <rect height="8" rx="2" width="8" x="13" y="3" />
      <rect height="8" rx="2" width="8" x="3" y="13" />
      <rect height="8" rx="2" width="8" x="13" y="13" />
    </>
  ),
  fees: (
    <>
      <rect height="13" rx="3" width="20" x="2" y="5.5" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  members: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path
        d="M2.5 20c.7-3.5 3.3-5.5 6.5-5.5s5.8 2 6.5 5.5M16 4.5a3.5 3.5 0 010 7M18.5 14.5c1.6.8 2.7 2.6 3 5.5"
        strokeLinecap="round"
      />
    </>
  ),
  calendar: (
    <>
      <rect height="16" rx="3" width="18" x="3" y="5" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" fill="currentColor" r="1.8" stroke="none" />
      <circle cx="12" cy="12" fill="currentColor" r="1.8" stroke="none" />
      <circle cx="19" cy="12" fill="currentColor" r="1.8" stroke="none" />
    </>
  ),
  today: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </>
  ),
  records: (
    <>
      <path d="M6 2.5h8.5L19 7v14.5H6z" strokeLinejoin="round" />
      <path d="M9.5 12h6M9.5 16h6" strokeLinecap="round" />
    </>
  ),
  progress: (
    <path d="M3 20h18M6 16v-4M11 16V8M16 16v-6M21 4l-5 5-4-3-6 5" {...round} />
  ),
};

export function NavIcon({
  name,
  variant = "sidebar",
  className,
}: {
  name: NavIconName;
  variant?: "sidebar" | "tab";
  className?: string;
}) {
  const tab = variant === "tab" ? tabPaths[name] : undefined;
  const size = variant === "tab" ? 24 : 18;
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeWidth={tab ? 2 : 1.6}
      viewBox={tab ? "0 0 24 24" : "0 0 18 18"}
      width={size}
    >
      {tab ?? sidebarPaths[name]}
    </svg>
  );
}
