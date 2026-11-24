/*
 * Query layer for join codes. Components import from here, never from api.ts.
 * Managing: ["academies", academyId, "invitation-codes"]. Joining (not academy-scoped):
 * ["invitation-codes", ...].
 */
import {
  type QueryClient,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  canExtendInvitationCodes,
  canPreviewCodesSignedOut,
  createInvitationCode,
  extendInvitationCode,
  getJoinedDetails,
  getJoinPreviewExtras,
  getJoinSession,
  type InvitationCode,
  type InvitationCodeErrorCode,
  type InvitationCodePreview,
  invitationCodeErrorCode,
  type JoinPreviewAs,
  listInvitationCodes,
  MAX_CODE_LIFETIME_MS,
  MAX_CODE_USES,
  previewInvitationCode,
  rateLimitRetryAt,
  redeemInvitationCode,
  referenceNow,
  revokeInvitationCode,
} from "@/features/join-codes/api";
import type { Id, Paginated } from "@/features/types";
import { viewerKeys } from "@/features/viewer/queries";
import { isUiPreview } from "@/lib/preview";

export type {
  InvitationCode,
  InvitationCodeErrorCode,
  InvitationCodePreview,
  InvitationCodeRedeemResult,
  InvitationCodeRole,
  InvitationCodeStatus,
  JoinedDetails,
  JoinPreviewAs,
  JoinSession,
} from "@/features/join-codes/api";

/** Server limits for a new code (invitation-codes.ts). */
export const CODE_LIMITS = {
  maxLifetimeMs: MAX_CODE_LIFETIME_MS,
  maxUses: MAX_CODE_USES,
} as const;

/** The `{ error: { code } }` of a failed code call, or null for anything else. */
export function joinCodeErrorCode(
  error: unknown
): InvitationCodeErrorCode | null {
  return invitationCodeErrorCode(error);
}

/** When code entry opens again after a 429, if the answer said (never guessed). */
export function joinCodeRetryAt(error: unknown, now: Date): Date | null {
  return rateLimitRetryAt(error, now);
}

/** Real mode can't preview a code signed out (the route needs a session). */
export const canPreviewJoinCodeSignedOut = canPreviewCodesSignedOut;

/** "Extend" has no endpoint; the control shows only in preview. */
export const canExtendJoinCodes = canExtendInvitationCodes;

/** "Now" for statuses and "Ends in 4 days" (the designs' moment in preview). */
export function useJoinCodesNow(): Date {
  return referenceNow();
}

export const joinCodeKeys = {
  list: (academyId: Id) =>
    ["academies", academyId, "invitation-codes"] as const,
  all: ["invitation-codes"] as const,
  session: (previewAs: string) =>
    ["invitation-codes", "session", previewAs] as const,
  preview: (code: string, userId: Id) =>
    ["invitation-codes", "preview", code, userId] as const,
  extras: (academyId: Id, teamId: Id | null) =>
    ["invitation-codes", "extras", academyId, teamId] as const,
  joined: (academyId: Id, teamId: Id | null) =>
    ["invitation-codes", "joined", academyId, teamId] as const,
};

export function joinCodesQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: joinCodeKeys.list(academyId),
    queryFn: () => listInvitationCodes(academyId),
    select: (page: Paginated<InvitationCode>) => page.data,
  });
}

export function joinSessionQueryOptions(input: {
  preview: boolean;
  previewAs?: JoinPreviewAs;
}) {
  return queryOptions({
    queryKey: joinCodeKeys.session(
      input.preview ? (input.previewAs ?? "claire") : "session"
    ),
    queryFn: () =>
      getJoinSession({
        previewAs: input.preview ? input.previewAs : undefined,
      }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** `code` is normalized (12 characters, no dashes). */
export function joinPreviewQueryOptions(code: string, userId: Id) {
  return queryOptions({
    queryKey: joinCodeKeys.preview(code, userId),
    queryFn: () => previewInvitationCode({ code }),
    retry: false,
    staleTime: 30_000,
  });
}

export function joinPreviewExtrasQueryOptions(
  academyId: Id,
  teamId: Id | null
) {
  return queryOptions({
    queryKey: joinCodeKeys.extras(academyId, teamId),
    queryFn: () => getJoinPreviewExtras({ academyId, teamId }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Place and next session on "Joined with a code", read as the new member. */
export function joinedDetailsQueryOptions(academyId: Id, teamId: Id | null) {
  return queryOptions({
    queryKey: joinCodeKeys.joined(academyId, teamId),
    queryFn: () => getJoinedDetails({ academyId, teamId }),
    staleTime: 60_000,
  });
}

function putCode(
  queryClient: QueryClient,
  code: InvitationCode,
  academyId: Id
) {
  queryClient.setQueryData<Paginated<InvitationCode>>(
    joinCodeKeys.list(academyId),
    (page) => {
      if (!page) {
        return page;
      }
      const exists = page.data.some((row) => row.id === code.id);
      return {
        ...page,
        data: exists
          ? page.data.map((row) => (row.id === code.id ? code : row))
          : [code, ...page.data],
      };
    }
  );
}

/** Create, revoke and extend put the server's row into the list and drop stale previews. */
function useCodeMutation<TInput extends { academyId: Id }>(
  mutationFn: (input: TInput) => Promise<InvitationCode>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (code, input) => {
      putCode(queryClient, code, input.academyId);
      await queryClient.invalidateQueries({ queryKey: joinCodeKeys.all });
    },
  });
}

export function useCreateJoinCode() {
  return useCodeMutation(createInvitationCode);
}

export function useRevokeJoinCode() {
  return useCodeMutation(revokeInvitationCode);
}

export function useExtendJoinCode() {
  return useCodeMutation(extendInvitationCode);
}

/**
 * Join, then refresh the academy's code list (uses) and the viewer's academies. The
 * cached preview is marked "already a member" rather than refetched: a single-use code
 * is used up now, and "You're in" still needs the academy and team it named.
 */
export function useRedeemJoinCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: redeemInvitationCode,
    onSuccess: async (result) => {
      queryClient.setQueriesData<InvitationCodePreview>(
        { queryKey: ["invitation-codes", "preview"] },
        (preview) =>
          preview?.academy.id === result.academy.id
            ? { ...preview, alreadyMember: true }
            : preview
      );
      // Preview seeds the viewer from the URL; only a real session changes here.
      if (!isUiPreview) {
        queryClient.removeQueries({ queryKey: viewerKeys.all });
      }
      await queryClient.invalidateQueries({
        queryKey: joinCodeKeys.list(result.academy.id),
      });
    },
  });
}
