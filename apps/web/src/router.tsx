import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { toast } from "sonner";

import { RouteErrorScreen } from "./components/error-state";
import Loader from "./components/loader";
import { NotFound } from "./components/not-found";
import {
  currentReturnPath,
  errorKind,
  isTransientError,
  logErrorInDev,
} from "./lib/errors";
import { routeTree } from "./routeTree.gen";

const ONE_MINUTE = 60_000;
/** One more go for a dropped connection or a server failure; never for a 4xx. */
const MAX_RETRIES = 1;
const SIGNED_IN_AREA = /^\/(app|admin|coach|student|owner)(\/|$)/;
const BACKGROUND_REFRESH_TOAST = "background-refresh-failed";

/*
 * Errors, in one place:
 * - A query that fails with nothing to show throws during render (`throwOnError`) to
 *   the nearest boundary: a section's <QueryBoundary> or the route's RouteErrorScreen.
 *   So no screen waits on a skeleton forever after a failure.
 * - A query that fails while it still has data (a background refetch) keeps showing
 *   that data; the QueryCache tells the person once with a toast.
 * - A 401 from a background refetch or a mutation sends the person to sign in again and
 *   back to where they were. (Initial loads do the same from their error boundary.)
 * - Mutations report their own failures where they happen (field errors, inline
 *   warnings, toasts).
 */
export const getRouter = () => {
  const signInAgain = () => {
    const redirect = currentReturnPath();
    if (!(redirect && SIGNED_IN_AREA.test(redirect))) {
      return;
    }
    router.navigate({ to: "/login", search: { redirect }, replace: true });
  };

  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.state.data === undefined) {
          return;
        }
        logErrorInDev(error, `refetch ${JSON.stringify(query.queryKey)}`);
        if (errorKind(error) === "unauthorized") {
          signInAgain();
          return;
        }
        toast.error("Couldn’t refresh. Showing what was loaded before.", {
          id: BACKGROUND_REFRESH_TOAST,
        });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        logErrorInDev(error, "mutation");
        if (errorKind(error) === "unauthorized") {
          signInAgain();
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: ONE_MINUTE,
        retry: (failureCount, error) =>
          failureCount < MAX_RETRIES && isTransientError(error),
        throwOnError: (_error, query) => query.state.data === undefined,
      },
    },
  });

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    context: { queryClient },
    defaultPendingComponent: () => <Loader />,
    defaultNotFoundComponent: () => <NotFound />,
    defaultErrorComponent: RouteErrorScreen,
    defaultOnCatch: (error) => logErrorInDev(error, "route"),
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
