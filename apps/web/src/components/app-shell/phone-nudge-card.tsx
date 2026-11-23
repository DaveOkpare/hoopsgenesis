/** Where "Get the app" points until the store links exist. */
export const GET_THE_APP_HREF = "/#get-the-app";

function PhoneIcon() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeWidth="1.6"
      viewBox="0 0 18 18"
      width="18"
    >
      <rect height="15" rx="2" width="9" x="4.5" y="1.5" />
      <path d="M8 13.5h2" strokeLinecap="round" />
    </svg>
  );
}

/** "Best on your phone" card in the coach sidebar (spec: nudge, don't block). */
export function PhoneNudgeCard() {
  return (
    <aside className="flex flex-col gap-[10px] rounded-[14px] border border-line bg-white p-[14px]">
      <p className="flex items-center gap-2 font-semibold text-ink text-sm leading-[18px]">
        <PhoneIcon />
        Best on your phone
      </p>
      <p className="text-[13px] text-muted leading-[18px]">
        Live check-ins and logging results at the court work best in the app.
      </p>
      <a
        className="w-fit rounded-sm font-semibold text-[13px] text-ink leading-4 underline decoration-1 underline-offset-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ink"
        href={GET_THE_APP_HREF}
      >
        Get the app
      </a>
    </aside>
  );
}

/**
 * Stand-in for phone-only actions (QR check-in/out) on the web, at every size.
 * Matches the "Check in with your phone" block on the student web Home.
 * tone="dark" sits inside an ink card; tone="light" on white.
 */
export function PhoneOnlyNotice({
  title = "Check in with your phone",
  description = "Scan the code at the entrance. The app checks you are at the academy.",
  tone = "dark",
}: {
  title?: string;
  description?: string;
  tone?: "dark" | "light";
}) {
  const dark = tone === "dark";
  return (
    <div
      className={
        dark
          ? "flex items-center gap-4 rounded-md bg-white/8 p-4 max-md:flex-wrap"
          : "flex items-center gap-4 rounded-md bg-fog p-4 max-md:flex-wrap"
      }
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-orange text-ink">
        <svg
          aria-hidden="true"
          fill="none"
          height="22"
          stroke="currentColor"
          strokeWidth="1.6"
          viewBox="0 0 18 18"
          width="22"
        >
          <rect height="15" rx="2" width="9" x="4.5" y="1.5" />
          <path d="M8 13.5h2" strokeLinecap="round" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span
          className={
            dark
              ? "font-semibold text-[15px] text-white leading-5"
              : "font-semibold text-[15px] text-ink leading-5"
          }
        >
          {title}
        </span>
        <span
          className={
            dark
              ? "text-[13px] text-white/72 leading-[18px]"
              : "text-[13px] text-muted leading-[18px]"
          }
        >
          {description}
        </span>
      </span>
      <a
        className={
          dark
            ? "shrink-0 rounded-full bg-white px-4 py-[10px] font-semibold text-ink text-sm leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-white max-md:w-full max-md:text-center"
            : "shrink-0 rounded-full bg-ink px-4 py-[10px] font-semibold text-sm text-white leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink max-md:w-full max-md:text-center"
        }
        href={GET_THE_APP_HREF}
      >
        Get the app
      </a>
    </div>
  );
}
