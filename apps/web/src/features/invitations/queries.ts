/*
 * Query layer for invitations. Components import from here, never from api.ts.
 */
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  acceptInvitation,
  getInvitation,
  getJoinSummary,
} from "@/features/invitations/api";
import type { Id } from "@/features/types";
import { viewerKeys } from "@/features/viewer/queries";
import { isUiPreview } from "@/lib/preview";

export type {
  InvitationDetails,
  InvitationLookup,
  JoinSummary,
} from "@/features/invitations/api";

export const invitationKeys = {
  all: ["invitations"] as const,
  detail: (invitationId: Id) => ["invitations", invitationId] as const,
  joinSummary: (invitationId: Id) =>
    ["invitations", invitationId, "join-summary"] as const,
};

export function invitationQueryOptions(invitationId: Id) {
  return queryOptions({
    queryKey: invitationKeys.detail(invitationId),
    queryFn: () => getInvitation({ invitationId }),
    retry: false,
  });
}

export function joinSummaryQueryOptions(invitationId: Id) {
  return queryOptions({
    queryKey: invitationKeys.joinSummary(invitationId),
    queryFn: () => getJoinSummary({ invitationId }),
  });
}

/**
 * Accept after sign-up or sign-in. The person now belongs to an academy, so the viewer
 * (memberships) and anything read about this invitation are dropped and read again.
 */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acceptInvitation,
    onSuccess: () => {
      // Preview seeds the viewer from the URL; only a real session changes here.
      if (!isUiPreview) {
        queryClient.removeQueries({ queryKey: viewerKeys.all });
      }
      queryClient.removeQueries({ queryKey: invitationKeys.all });
    },
  });
}
