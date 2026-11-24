import { cn } from "@hoops-genesis/ui/lib/utils";
import type * as React from "react";

/*
 * Empty state from "Teams / Empty state":
 * <Empty>
 *   <EmptyMediaStack><BasketballIcon /></EmptyMediaStack>
 *   <EmptyHeader>
 *     <EmptyTitle>No teams yet</EmptyTitle>
 *     <EmptyDescription>Teams decide which students…</EmptyDescription>
 *   </EmptyHeader>
 *   <Button size="lg">Create team</Button>
 * </Empty>
 */

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg border-[1.5px] border-stone border-dashed bg-white px-6 py-12 text-center",
        className
      )}
      data-slot="empty"
      {...props}
    />
  );
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col items-center gap-[10px]", className)}
      data-slot="empty-header"
      {...props}
    />
  );
}

/** Ink tile with two tilted fog cards behind it (200×140). Put a 56px icon inside. */
function EmptyMediaStack({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("relative h-[140px] w-[200px] shrink-0", className)}
      data-slot="empty-media"
      {...props}
    >
      <div className="absolute top-[30px] left-[10px] h-24 w-[110px] origin-top-left -rotate-8 rounded-md bg-fog" />
      <div className="absolute top-[18px] left-[80px] h-24 w-[110px] origin-top-left rotate-7 rounded-md bg-fog" />
      <div className="absolute top-[22px] left-[45px] flex size-[110px] items-center justify-center rounded-[18px] bg-ink">
        {children}
      </div>
    </div>
  );
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "font-display text-[44px] text-ink uppercase leading-none max-md:text-[34px]",
        className
      )}
      data-slot="empty-title"
      {...props}
    />
  );
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "max-w-[440px] text-[17px] text-muted leading-body max-md:text-[15px]",
        className
      )}
      data-slot="empty-description"
      {...props}
    />
  );
}

/*
 * Smaller empty states from "[Spec] Empty, loading and error states" (AGW-0). Each says
 * what is missing, why, and the one thing to do next. Keep the page title, tabs and
 * main button on screen and put one of these where the data would be.
 *
 *   <EmptyNote title="It’s just you so far" description="Invite coaches…"
 *     actions={<><Button size="sm">Invite people</Button>…</>} />
 *       First use or an empty range: plain left-aligned text under the real rows.
 *   <EmptyClear title="You’re all caught up" description="New report cards…" />
 *       A queue with nothing waiting: dashed box.
 *   <EmptyDone title="Everyone has paid for November"
 *     description="64 students · RWF 1,920,000 collected." />
 *       Good news: green box with a check, and the total that proves it.
 *       size="section" (default, 44px check, 26px title) or "page" (56px, 34px title).
 *   <EmptyWaiting title="You’re not on a team yet" description="Sharika D. will…" />
 *       Waiting on someone else: orange-soft box. Say who will act; no button.
 */

interface EmptyBlockProps extends Omit<React.ComponentProps<"div">, "title"> {
  /** Buttons or a link under the text (EmptyNote, EmptyDone). */
  actions?: React.ReactNode;
  description?: React.ReactNode;
  title: React.ReactNode;
}

function EmptyNote({
  title,
  description,
  actions,
  className,
  ...props
}: EmptyBlockProps) {
  return (
    <div
      className={cn("flex flex-col items-start gap-[6px] pt-[6px]", className)}
      data-slot="empty-note"
      {...props}
    >
      <p className="font-semibold text-base text-ink leading-[22px]">{title}</p>
      {description ? (
        <p className="text-muted text-sm leading-5">{description}</p>
      ) : null}
      {actions ? (
        <div className="flex flex-wrap gap-2 pt-2">{actions}</div>
      ) : null}
    </div>
  );
}

function EmptyClear({
  title,
  description,
  actions,
  className,
  ...props
}: EmptyBlockProps) {
  return (
    <div
      className={cn(
        "flex flex-col justify-center gap-[6px] rounded-[20px] border-[#d0d0cc] border-[1.5px] border-dashed p-5",
        className
      )}
      data-slot="empty-clear"
      {...props}
    >
      <p className="font-semibold text-base text-ink leading-[22px]">{title}</p>
      {description ? (
        <p className="text-muted text-sm leading-5">{description}</p>
      ) : null}
      {actions ? (
        <div className="flex flex-wrap gap-2 pt-2">{actions}</div>
      ) : null}
    </div>
  );
}

function CheckMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 22 22">
      <path
        d="M5.5 11.5l3.8 3.8 7.2-8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

function EmptyDone({
  title,
  description,
  actions,
  size = "section",
  className,
  ...props
}: EmptyBlockProps & { size?: "section" | "page" }) {
  const isPage = size === "page";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center bg-[#eaf6ef] text-center",
        isPage ? "gap-3 rounded-lg px-6 py-9" : "gap-[10px] rounded-[20px] p-5",
        className
      )}
      data-slot="empty-done"
      role="status"
      {...props}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-success text-white",
          isPage ? "size-14" : "size-11"
        )}
      >
        <CheckMark className={isPage ? "size-[26px]" : "size-[22px]"} />
      </span>
      <p
        className={cn(
          "font-display text-ink uppercase",
          isPage ? "text-[34px] leading-[34px]" : "text-[26px] leading-7"
        )}
      >
        {title}
      </p>
      {description ? (
        <p
          className={cn(
            "max-w-[480px] text-ink-soft",
            isPage ? "text-[15px] leading-[21px]" : "text-sm leading-5"
          )}
        >
          {description}
        </p>
      ) : null}
      {actions ? (
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

function EmptyWaiting({
  title,
  description,
  className,
  ...props
}: Omit<EmptyBlockProps, "actions">) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-[20px] bg-orange-soft p-5",
        className
      )}
      data-slot="empty-waiting"
      {...props}
    >
      <span
        aria-hidden="true"
        className="flex size-[52px] shrink-0 items-center justify-center rounded-full border-2 border-orange-deep border-dashed font-display text-[22px] text-orange-deep leading-6"
      >
        ?
      </span>
      <div className="flex min-w-0 flex-col gap-[6px]">
        <p className="font-semibold text-base text-ink leading-[22px]">
          {title}
        </p>
        {description ? (
          <p className="text-ink-soft text-sm leading-5">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

export {
  Empty,
  EmptyClear,
  EmptyDescription,
  EmptyDone,
  EmptyHeader,
  EmptyMediaStack,
  EmptyNote,
  EmptyTitle,
  EmptyWaiting,
};
