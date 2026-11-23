/*
 * Query layer for the viewer. Components use these hooks, never api.ts directly.
 * Pattern for other features:
 *   export const feeKeys = { all: (academyId: Id) => ["academies", academyId, "fees"] as const, ... }
 *   export const feesQueryOptions = (academyId: Id, params) => queryOptions({ queryKey: [...feeKeys.all(academyId), params], queryFn: () => listFees(academyId, params) })
 *   export function useRecordPayment() { return useMutation({ mutationFn: recordPayment, onSuccess: () => qc.invalidateQueries({ queryKey: feeKeys.all(id) }) }) }
 * In a route: `loader: ({ context }) => context.queryClient.ensureQueryData(feesQueryOptions(...))`
 * In a component: `const { data } = useSuspenseQuery(feesQueryOptions(...))`.
 */
import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import {
  fetchViewer,
  setActiveAcademy,
  stopImpersonating,
  type Viewer,
} from "@/features/viewer/api";
import { getActiveMembership } from "@/features/viewer/selectors";

export const viewerKeys = {
  all: ["viewer"] as const,
};

export function viewerQueryOptions() {
  return queryOptions({
    queryKey: viewerKeys.all,
    queryFn: fetchViewer,
    // Session data: refetch only when we invalidate it (sign-in, switch academy).
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** The signed-in person. Always available under /_auth (the guard loads it). */
export function useViewer(): Viewer {
  return useSuspenseQuery(viewerQueryOptions()).data;
}

/** The academy being worked in, with this person's roles there. */
export function useActiveMembership() {
  return getActiveMembership(useViewer());
}

/** Switch academy; academy-scoped queries are refetched for the new academy. */
export function useSetActiveAcademy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setActiveAcademy,
    onSuccess: async ({ activeAcademyId }) => {
      queryClient.setQueryData<Viewer>(viewerKeys.all, (viewer) =>
        viewer ? { ...viewer, activeAcademyId } : viewer
      );
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === "academies",
      });
    },
  });
}

export function useStopImpersonating() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: stopImpersonating,
    onSuccess: () => {
      queryClient.setQueryData<Viewer>(viewerKeys.all, (viewer) =>
        viewer ? { ...viewer, impersonation: null } : viewer
      );
    },
  });
}
