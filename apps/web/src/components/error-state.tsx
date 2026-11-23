import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMediaStack,
  EmptyTitle,
} from "@hoops-genesis/ui/components/empty";
import { cn } from "@hoops-genesis/ui/lib/utils";
import {
  QueryErrorResetBoundary,
  useQueryErrorResetBoundary,
} from "@tanstack/react-query";
import {
  CatchBoundary,
  type ErrorComponentProps,
  Link,
  Navigate,
  useRouter,
} from "@tanstack/react-router";
import { LockKeyhole, RotateCw, TriangleAlert, WifiOff } from "lucide-react";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useState,
} from "react";

import { NotFound } from "@/components/not-found";
import { PageFrame } from "@/components/page-frame";
import {
  currentReturnPath,
  type ErrorKind,
  errorKind,
  logErrorInDev,
} from "@/lib/errors";

/*
 * Error states. Screens never render an error's own message: the copy comes from the
 * kind of failure (lib/errors.ts).
 *
 *   <QueryBoundary what="unpaid students">  a section whose queries may fail. A failed
 *     query with no data throws (QueryClient default `throwOnError`), lands here, and
 *     only this section shows the error with "Try again"; the rest of the page stays.
 *   RouteErrorScreen  the router's default errorComponent: a whole page failed (loader,
 *     beforeLoad, render or a page-level query). Inside the AppShell for signed-in pages.
 *   ErrorState  the visual itself, for screens that handle `query.error` inline (with
 *     `throwOnError: false`), such as dialogs whose queries run while they are closed.
 *     `failedQueries(a, b)` gives the first error and a retry that refetches the failed.
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
    description:
      "This didn’t load. It’s usually brief, so try again in a moment.",
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

const ICONS = {
  offline: WifiOff,
  failed: TriangleAlert,
  forbidden: LockKeyhole,
  not_found: TriangleAlert,
} as const;

/** 401: the session ended. Go to sign in, and come back here afterwards. */
function SignInAgain({ variant }: { variant: "page" | "section" }) {
  const redirect = currentReturnPath();
  return (
    <Empty className={variant === "section" ? "gap-3 py-8" : undefined}>
      <EmptyHeader>
        <EmptyTitle className={variant === "section" ? SECTION_TITLE : ""}>
          Signing you in again
        </EmptyTitle>
        <EmptyDescription>
          Your session ended. Taking you to sign in…
        </EmptyDescription>
      </EmptyHeader>
      <Navigate replace search={{ redirect }} to="/login" />
    </Empty>
  );
}

const SECTION_TITLE = "text-[28px] max-md:text-[24px]";

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
  /** page: fills the main column with the large empty-state art. section: compact. */
  variant?: "page" | "section";
  /** Section title "Couldn’t load {what}" instead of the generic one. */
  what?: string;
  /** Where "Go home" leads; public pages pass "/". */
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
    return <SignInAgain variant={variant} />;
  }
  const copy = COPY[kind];
  const Icon = ICONS[kind];
  const canRetry = Boolean(onRetry) && kind !== "forbidden";
  const isPage = variant === "page";
  const title =
    !isPage && what && kind !== "forbidden"
      ? `Couldn’t load ${what}`
      : copy.title;

  return (
    <Empty
      className={cn(!isPage && "flex-none gap-4 px-5 py-8", className)}
      data-error-kind={kind}
      role="alert"
    >
      {isPage ? (
        <EmptyMediaStack>
          <Icon className="size-14 text-white" strokeWidth={1.75} />
        </EmptyMediaStack>
      ) : null}
      <EmptyHeader>
        <EmptyTitle className={isPage ? undefined : SECTION_TITLE}>
          {title}
        </EmptyTitle>
        <EmptyDescription className={isPage ? undefined : "text-[15px]"}>
          {copy.description}
        </EmptyDescription>
      </EmptyHeader>
      <div className="flex flex-wrap items-center justify-center gap-3 max-md:w-full max-md:flex-col">
        {canRetry ? (
          <Button
            className="max-md:w-full"
            disabled={retrying}
            onClick={retry}
            size={isPage ? "lg" : "default"}
          >
            <RotateCw
              aria-hidden="true"
              className={cn(retrying && "animate-spin")}
            />
            {retrying ? "Trying again…" : "Try again"}
          </Button>
        ) : null}
        {isPage ? (
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
        ) : null}
      </div>
    </Empty>
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
 * screen; everything else the page-sized ErrorState, inside the shell when signed in.
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
