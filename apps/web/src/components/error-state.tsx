import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@hoops-genesis/ui/components/dialog";
import { cn } from "@hoops-genesis/ui/lib/utils";
import {
  QueryErrorResetBoundary,
  useQuery,
  useQueryErrorResetBoundary,
} from "@tanstack/react-query";
import {
  CatchBoundary,
  type ErrorComponentProps,
  Link,
  Navigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { RotateCw } from "lucide-react";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  AcademySwitcherSheet,
  SHELL_SHEET_CLASS,
} from "@/components/app-shell/academy-switcher";
import { NotFound } from "@/components/not-found";
import { PageFrame } from "@/components/page-frame";
import type { AcademyRole } from "@/features/types";
import type { Viewer } from "@/features/viewer/api";
import { viewerQueryOptions } from "@/features/viewer/queries";
import {
  getActiveMembership,
  homePathFor,
  isOwner,
  primaryRole,
} from "@/features/viewer/selectors";
import {
  currentReturnPath,
  type ErrorKind,
  errorKind,
  logErrorInDev,
} from "@/lib/errors";

/*
 * Error states ("[Spec] Empty, loading and error states" AGW-0, section 3). Screens
 * never render an error's own message: the copy comes from the kind of failure
 * (lib/errors.ts). Say what went wrong in plain words, keep what still works on screen,
 * and give one way out.
 *
 *   <QueryBoundary what="the fees">  a section whose queries may fail. A failed query
 *     with no data throws (QueryClient default `throwOnError`), lands here, and only
 *     this section shows "We couldn’t load the fees" with "Try again"; the page title,
 *     the nav and the other sections stay.
 *   RouteErrorScreen  the router's default errorComponent: a whole page failed (loader,
 *     beforeLoad, render or a page-level query). Inside the AppShell for signed-in pages.
 *     404 shows the dark "Out of bounds" page; 403 the "This page is for admins" page.
 *   ErrorState  the visual itself, for screens that handle `query.error` inline (with
 *     `throwOnError: false`), such as dialogs whose queries run while they are closed.
 *     variant="section" (default): fog card, left-aligned. variant="page": fills the
 *     main column. `failedQueries(a, b)` gives the first error and a retry for all.
 *   Offline: the black bar and useIsOffline() live in components/offline.tsx.
 */

interface RetryableQuery {
  error: unknown;
  isError: boolean;
  refetch: () => Promise<unknown>;
}

/** The first failure among `queries`, and a retry that refetches every failed one. */
export function failedQueries(...queries: RetryableQuery[]): {
  error: unknown;
  retry: () => Promise<unknown>;
} | null {
  const failed = queries.filter((query) => query.isError);
  if (failed.length === 0) {
    return null;
  }
  return {
    error: failed[0]?.error,
    retry: () => Promise.all(failed.map((query) => query.refetch())),
  };
}

const COPY: Record<
  Exclude<ErrorKind, "unauthorized">,
  { title: string; description: string }
> = {
  offline: {
    title: "No connection",
    description:
      "We couldn’t reach Hoops Genesis. Check your connection, then try again.",
  },
  failed: {
    title: "Something went wrong",
    description: "Your data is safe. Try again in a moment.",
  },
  forbidden: {
    title: "No access",
    description:
      "You don’t have access to this. If you think you should, ask your academy admin.",
  },
  not_found: {
    title: "Not found",
    description: "It may have been removed, or the link is old.",
  },
};

/** Orange-deep circled "!" from the spec's "We couldn’t load the fees" card. */
function AlertIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 28 28">
      <circle
        cx="14"
        cy="14"
        fill="none"
        r="11"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M14 8.5v7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
      <circle cx="14" cy="19.5" fill="currentColor" r="1.4" />
    </svg>
  );
}

/** 401: the session ended. Go to sign in, and come back here afterwards. */
function SignInAgain({
  variant,
  className,
}: {
  variant: "page" | "section";
  className?: string;
}) {
  const redirect = currentReturnPath();
  const isPage = variant === "page";
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-2 bg-fog",
        isPage
          ? "flex-1 justify-center rounded-lg p-10 max-md:p-6"
          : "rounded-[18px] p-[18px]",
        className
      )}
      role="status"
    >
      <p
        className={cn(
          isPage
            ? "font-display text-[44px] text-ink uppercase leading-none max-md:text-[34px]"
            : "font-semibold text-base text-ink leading-[22px]"
        )}
      >
        Signing you in again
      </p>
      <p className="text-muted text-sm leading-5">
        Your session ended. Taking you to sign in…
      </p>
      <Navigate replace search={{ redirect }} to="/login" />
    </div>
  );
}

const ROLE_AREAS: Record<string, string> = {
  "/admin": "admins",
  "/coach": "coaches",
  "/student": "students",
  "/owner": "the platform owner",
};

const ROLE_NOUN: Record<AcademyRole, string> = {
  admin: "an admin",
  coach: "a coach",
  student: "a student",
};

const HOME_LABEL: Record<string, string> = {
  "/admin": "Go to Dashboard",
  "/coach": "Go to Today",
  "/student": "Go to Today",
  "/owner": "Go to Academies",
  "/join": "Join an academy",
};

function forbiddenDescription(viewer: Viewer | undefined): string {
  if (viewer && isOwner(viewer)) {
    return "You’re signed in as the platform owner. Open the academy from the owner console instead.";
  }
  const membership = viewer ? getActiveMembership(viewer) : null;
  if (membership) {
    return `You’re signed in as ${ROLE_NOUN[primaryRole(membership)]} in ${membership.academy.name}. Ask your academy admin if you need access.`;
  }
  return COPY.forbidden.description;
}

/**
 * 403 as a page ("Wrong role"): name the role they have and who to ask, send them to
 * their own home, never show the hidden data. Works outside the shell too (it reads
 * the viewer from the cache and falls back to general copy).
 */
function ForbiddenPage({ className }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Read the signed-in person from the cache only; never fetch from an error screen.
  const { data: viewer } = useQuery({
    ...viewerQueryOptions(),
    enabled: false,
  });
  const area = Object.keys(ROLE_AREAS).find(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const home = viewer ? homePathFor(viewer) : "/app";
  const canSwitch = (viewer?.memberships.length ?? 0) > 1;
  return (
    <section
      aria-labelledby="forbidden-title"
      className={cn(
        "flex flex-col gap-10 rounded-lg border border-line p-10 max-md:border-0 max-md:p-0",
        className
      )}
      data-error-kind="forbidden"
    >
      <div className="flex max-w-[640px] flex-col gap-[10px]">
        <p className="font-medium text-[13px] text-muted uppercase leading-4 tracking-label">
          403 · Not allowed
        </p>
        <h1
          className="font-display text-[56px] text-ink uppercase leading-[56px] max-md:text-[38px] max-md:leading-[38px]"
          id="forbidden-title"
        >
          {area ? `This page is for ${ROLE_AREAS[area]}` : "No access"}
        </h1>
        <p className="text-[17px] text-muted leading-body max-md:text-sm max-md:leading-5">
          {forbiddenDescription(viewer)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 max-md:flex-col">
        <Link
          className={cn(buttonVariants({ size: "lg" }), "max-md:w-full")}
          to={home}
        >
          {HOME_LABEL[home] ?? "Go to your home"}
        </Link>
        {canSwitch ? (
          <Dialog>
            <DialogTrigger
              render={
                <Button className="max-md:w-full" size="lg" variant="outline" />
              }
            >
              Switch academy
            </DialogTrigger>
            <DialogContent className={SHELL_SHEET_CLASS}>
              <AcademySwitcherSheet />
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </section>
  );
}

type ShownKind = Exclude<ErrorKind, "unauthorized">;

/** Title and text for a failure, from its kind (never the error's own message). */
function errorCopy(
  kind: ShownKind,
  isPage: boolean,
  what?: string
): { title: string; description: string } {
  const { title, description } = COPY[kind];
  if (kind === "offline") {
    return isPage
      ? { title, description }
      : {
          title: what ? `We couldn’t load ${what}` : "We couldn’t load this",
          description: "No connection. Check it, then try again.",
        };
  }
  if (kind === "failed") {
    if (isPage) {
      return { title: "This page didn’t load", description };
    }
    return {
      title: what ? `We couldn’t load ${what}` : "We couldn’t load this",
      description,
    };
  }
  return { title, description };
}

function ErrorActions({
  isPage,
  canRetry,
  retrying,
  onRetry,
  homeTo,
}: {
  isPage: boolean;
  canRetry: boolean;
  retrying: boolean;
  onRetry: () => void;
  homeTo: "/app" | "/";
}) {
  if (!(canRetry || isPage)) {
    return null;
  }
  const retryLabel = retrying ? "Trying again…" : "Try again";
  if (!isPage) {
    return (
      <div className="pt-1">
        <Button
          className="px-[18px]"
          disabled={retrying}
          onClick={onRetry}
          size="sm"
        >
          {retryLabel}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 pt-3 max-md:w-full max-md:flex-col">
      {canRetry ? (
        <Button
          className="max-md:w-full"
          disabled={retrying}
          onClick={onRetry}
          size="lg"
        >
          <RotateCw
            aria-hidden="true"
            className={cn(retrying && "animate-spin")}
          />
          {retryLabel}
        </Button>
      ) : null}
      <Link
        className={cn(
          buttonVariants({
            variant: canRetry ? "outline" : "default",
            size: "lg",
          }),
          "max-md:w-full"
        )}
        to={homeTo}
      >
        Go to your home
      </Link>
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  variant = "section",
  what,
  homeTo = "/app",
  className,
}: {
  error: unknown;
  /** Shown as "Try again" for failures that can pass on a second go. */
  onRetry?: () => unknown;
  /** page: fills the main column. section: a compact fog card in place of the data. */
  variant?: "page" | "section";
  /** Section title "We couldn’t load {what}" instead of the generic one. */
  what?: string;
  /** Where "Go to your home" leads; public pages pass "/". */
  homeTo?: "/app" | "/";
  className?: string;
}) {
  const [retrying, setRetrying] = useState(false);
  const kind = errorKind(error);
  const retry = useCallback(async () => {
    if (!onRetry) {
      return;
    }
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }, [onRetry]);

  if (kind === "unauthorized") {
    return <SignInAgain className={className} variant={variant} />;
  }
  const isPage = variant === "page";
  if (isPage && kind === "not_found") {
    return <NotFound />;
  }
  if (isPage && kind === "forbidden") {
    return <ForbiddenPage className={className} />;
  }
  const { title, description } = errorCopy(kind, isPage, what);

  return (
    <div
      className={cn(
        "flex flex-col items-start bg-fog",
        isPage
          ? "flex-1 justify-center gap-3 rounded-lg p-10 max-md:p-6"
          : "gap-2 rounded-[18px] p-[18px]",
        className
      )}
      data-error-kind={kind}
      role="alert"
    >
      <AlertIcon
        className={cn(
          "shrink-0 text-orange-deep",
          isPage ? "size-10" : "size-7"
        )}
      />
      <p
        className={cn(
          "text-ink",
          isPage
            ? "font-display text-[44px] uppercase leading-none max-md:text-[34px]"
            : "font-semibold text-base leading-[22px]"
        )}
      >
        {title}
      </p>
      <p
        className={cn(
          "max-w-[480px] text-muted",
          isPage
            ? "text-[17px] leading-body max-md:text-[15px]"
            : "text-sm leading-5"
        )}
      >
        {description}
      </p>
      <ErrorActions
        canRetry={Boolean(onRetry) && kind !== "forbidden"}
        homeTo={homeTo}
        isPage={isPage}
        onRetry={retry}
        retrying={retrying}
      />
    </div>
  );
}

const SectionCopy = createContext<{ what?: string; className?: string }>({});

function SectionError({ error, reset }: ErrorComponentProps) {
  const { what, className } = use(SectionCopy);
  const { reset: resetQueries } = useQueryErrorResetBoundary();
  const retry = useCallback(() => {
    // Let the failed queries fetch again when the section remounts.
    resetQueries();
    reset();
  }, [reset, resetQueries]);
  return (
    <ErrorState
      className={className}
      error={error}
      onRetry={retry}
      what={what}
    />
  );
}

/** `className` for a QueryBoundary inside DialogContent: DialogBody's own padding. */
export const DIALOG_ERROR_CLASS =
  "mx-7 mt-5 mb-6 w-auto max-md:mx-5 max-md:mt-3";

const logSectionError = (error: unknown) => logErrorInDev(error, "section");

/**
 * Contains a section's failure: a query in `children` that fails with nothing to show
 * renders a compact error with "Try again" here, and the rest of the page carries on.
 */
export function QueryBoundary({
  children,
  what,
  className,
  resetKey = 0,
}: {
  children: ReactNode;
  what?: string;
  className?: string;
  /** A new value clears the error (e.g. the selected item's id). */
  resetKey?: string | number;
}) {
  const getResetKey = useCallback(() => resetKey, [resetKey]);
  return (
    <SectionCopy value={{ what, className }}>
      <QueryErrorResetBoundary>
        <CatchBoundary
          errorComponent={SectionError}
          getResetKey={getResetKey}
          onCatch={logSectionError}
        >
          {children}
        </CatchBoundary>
      </QueryErrorResetBoundary>
    </SectionCopy>
  );
}

/**
 * The router's default errorComponent. A page-level failure: 404 shows the not-found
 * screen, 403 the "not allowed" page; everything else the page-sized ErrorState,
 * inside the shell when signed in.
 */
export function RouteErrorScreen({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const { reset: resetQueries } = useQueryErrorResetBoundary();
  // Synchronises TanStack Query's error-reset flag (outside React): queries that threw
  // here may fetch again when the page remounts, by "Try again" or by navigating back.
  useEffect(() => {
    resetQueries();
  }, [resetQueries]);
  const retry = useCallback(async () => {
    await router.invalidate();
    reset();
  }, [reset, router]);
  const { pathname } = router.state.location;
  const isSignedInArea = SIGNED_IN_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (errorKind(error) === "not_found") {
    return <NotFound />;
  }
  return (
    <PageFrame>
      <ErrorState
        error={error}
        homeTo={isSignedInArea ? "/app" : "/"}
        onRetry={retry}
        variant="page"
      />
    </PageFrame>
  );
}

const SIGNED_IN_PREFIXES = ["/app", "/admin", "/coach", "/student", "/owner"];
