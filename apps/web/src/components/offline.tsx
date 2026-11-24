import { cn } from "@hoops-genesis/ui/lib/utils";
import {
  type QueryCacheNotifyEvent,
  type QueryClient,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useState, useSyncExternalStore } from "react";

import { isNetworkFailure } from "@/lib/api-client";
import { formatTime } from "@/lib/format";

/*
 * Offline ("[Spec] Empty, loading and error states" AGW-0, "Phone offline";
 * "[Student · Mobile] Today · offline" BPJ-0).
 *
 *   const offline = useIsOffline();   true when the browser says it is offline, or the
 *     last request failed to reach the server (until a request gets through again).
 *     Use it to turn off actions that need the server:
 *     <Button disabled={offline}>{offline ? "Check-in needs a connection" : "Check in"}</Button>
 *   <OfflineBanner />   the black bar at the top. The AppShell mounts it for every
 *     signed-in screen; public pages don't need it.
 *
 * What stays usable offline: whatever is already on screen (TanStack Query keeps the
 * data loaded in this visit in memory) and moving between pages whose data was already
 * loaded. There is no offline storage: a reload, or a page not opened yet, shows the
 * "No connection" error with "Try again". Writes need the server, so screens disable
 * them with useIsOffline(). The banner says when the data on screen was last loaded.
 */

interface ConnectionStore {
  /** Last time any query loaded successfully (ms since epoch), 0 if never. */
  lastLoadedAt: () => number;
  /** The most recent request failed before reaching the server. */
  requestFailed: () => boolean;
  subscribe: (listener: () => void) => () => void;
}

const stores = new WeakMap<QueryClient, ConnectionStore>();

function latestLoad(queryClient: QueryClient): number {
  let latest = 0;
  for (const query of queryClient.getQueryCache().getAll()) {
    latest = Math.max(latest, query.state.dataUpdatedAt);
  }
  return latest;
}

/** Watches the query and mutation caches for requests that never reached the server. */
function connectionStore(queryClient: QueryClient): ConnectionStore {
  const existing = stores.get(queryClient);
  if (existing) {
    return existing;
  }
  let failed = false;
  let lastLoadedAt = latestLoad(queryClient);
  const listeners = new Set<() => void>();
  let stop: (() => void) | null = null;
  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  const onQuery = (event: QueryCacheNotifyEvent) => {
    if (event.type !== "updated") {
      return;
    }
    const { action } = event;
    if (action.type === "success") {
      lastLoadedAt = Math.max(lastLoadedAt, event.query.state.dataUpdatedAt);
      failed = false;
      emit();
    } else if (action.type === "error") {
      const networkFailed = isNetworkFailure(action.error);
      if (networkFailed !== failed) {
        failed = networkFailed;
        emit();
      }
    }
  };
  const store: ConnectionStore = {
    lastLoadedAt: () => lastLoadedAt,
    requestFailed: () => failed,
    subscribe: (listener) => {
      listeners.add(listener);
      if (!stop) {
        const stopQueries = queryClient.getQueryCache().subscribe(onQuery);
        const stopMutations = queryClient
          .getMutationCache()
          .subscribe((event) => {
            if (event.type !== "updated") {
              return;
            }
            const { action } = event;
            if (action.type === "error" && isNetworkFailure(action.error)) {
              failed = true;
              emit();
            } else if (action.type === "success" && failed) {
              failed = false;
              emit();
            }
          });
        stop = () => {
          stopQueries();
          stopMutations();
        };
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stop?.();
          stop = null;
        }
      };
    },
  };
  stores.set(queryClient, store);
  return store;
}

function subscribeBrowser(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

const browserOnline = () => navigator.onLine;
const onlineOnServer = () => true;
const neverFailedOnServer = () => false;
const noLoadOnServer = () => 0;

/** Offline per the browser, or the last request couldn't reach the server. */
export function useIsOffline(): boolean {
  const store = connectionStore(useQueryClient());
  const online = useSyncExternalStore(
    subscribeBrowser,
    browserOnline,
    onlineOnServer
  );
  const failed = useSyncExternalStore(
    store.subscribe,
    store.requestFailed,
    neverFailedOnServer
  );
  return !online || failed;
}

function NoSignalIcon() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      height="18"
      viewBox="0 0 18 18"
      width="18"
    >
      <path
        d="M2 6.5a10.5 10.5 0 0114 0M4.5 9.5a6.5 6.5 0 019 0M7 12.3a2.8 2.8 0 014 0M2.5 2.5l13 13"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/**
 * The black "No connection" bar. Shows only while offline; "Retry" reloads the data on
 * screen. `timeZone` formats the "what you saw at" time (the academy's zone).
 */
export function OfflineBanner({
  timeZone,
  className,
}: {
  timeZone?: string;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const store = connectionStore(queryClient);
  const offline = useIsOffline();
  const lastLoadedAt = useSyncExternalStore(
    store.subscribe,
    store.lastLoadedAt,
    noLoadOnServer
  );
  const [retrying, setRetrying] = useState(false);
  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      await queryClient.refetchQueries({ type: "active" });
    } finally {
      setRetrying(false);
    }
  }, [queryClient]);

  if (!offline) {
    return null;
  }
  const message = lastLoadedAt
    ? `No connection. Showing what you saw at ${formatTime(new Date(lastLoadedAt), timeZone)}.`
    : "No connection. Check your connection, then try again.";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-[10px] bg-ink px-5 py-[10px] text-white md:px-6",
        className
      )}
      role="status"
    >
      <NoSignalIcon />
      <p className="min-w-0 flex-1 font-semibold text-[13px] leading-[17px]">
        {message}
      </p>
      <button
        className="relative shrink-0 cursor-pointer rounded-sm font-semibold text-[13px] text-orange leading-[17px] outline-none before:absolute before:-inset-3 focus-visible:ring-2 focus-visible:ring-white disabled:cursor-progress disabled:opacity-70"
        disabled={retrying}
        onClick={retry}
        type="button"
      >
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}
