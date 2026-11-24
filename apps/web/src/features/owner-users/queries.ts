/* Query layer for the owner Users screens. Components import from here, never api.ts. */
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  banUser,
  getPlatformUser,
  impersonateUser,
  listUserSessions,
  listUsers,
  revokeUserSessions,
  unbanUser,
} from "@/features/owner-users/api";
import type { Id } from "@/features/types";
import { rememberImpersonator } from "@/features/viewer/api";
import { useViewer, viewerKeys } from "@/features/viewer/queries";
import { isUiPreview } from "@/lib/preview";

export type {
  ListUsersResult,
  PlatformUser,
  PlatformUserMembership,
  UserSession,
} from "@/features/owner-users/api";

export const platformUserKeys = {
  all: ["platform", "users"] as const,
  page: (searchValue: string, page: number, perPage: number) =>
    [...platformUserKeys.all, "search", searchValue, perPage, page] as const,
  detail: (userId: Id) => [...platformUserKeys.all, "detail", userId] as const,
  sessions: (userId: Id) =>
    [...platformUserKeys.all, "sessions", userId] as const,
};

/** One page of people (page numbers from 1). */
export function platformUsersQueryOptions(
  searchValue: string,
  page = 1,
  perPage = 25
) {
  const needle = searchValue.trim();
  return queryOptions({
    queryKey: platformUserKeys.page(needle.toLowerCase(), page, perPage),
    queryFn: () =>
      listUsers({
        searchValue: needle,
        offset: (page - 1) * perPage,
        limit: perPage,
      }),
    placeholderData: keepPreviousData,
  });
}

export function platformUserQueryOptions(userId: Id) {
  return queryOptions({
    queryKey: platformUserKeys.detail(userId),
    queryFn: () => getPlatformUser(userId),
  });
}

export function userSessionsQueryOptions(userId: Id) {
  return queryOptions({
    queryKey: platformUserKeys.sessions(userId),
    queryFn: () => listUserSessions(userId),
  });
}

function useRefreshUsers() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: platformUserKeys.all });
}

export function useBanUser() {
  const refresh = useRefreshUsers();
  return useMutation({ mutationFn: banUser, onSuccess: refresh });
}

export function useUnbanUser() {
  const refresh = useRefreshUsers();
  return useMutation({ mutationFn: unbanUser, onSuccess: refresh });
}

export function useRevokeUserSessions() {
  const refresh = useRefreshUsers();
  return useMutation({ mutationFn: revokeUserSessions, onSuccess: refresh });
}

/**
 * "View as": the session becomes the other person's. Remembers the owner for the
 * "Viewing as" banner, and drops every cached query (they were the owner's).
 */
export function useImpersonateUser() {
  const queryClient = useQueryClient();
  const { user: owner } = useViewer();
  return useMutation({
    mutationFn: (input: { userId: Id }) => {
      rememberImpersonator({
        id: owner.id,
        name: owner.name,
        email: owner.email,
        image: owner.image,
      });
      return impersonateUser(input);
    },
    onSuccess: () => {
      if (!isUiPreview) {
        // Only the viewer now: dropping everything would make this still-mounted
        // screen refetch the owner's queries as the other person (403s). The
        // owner's "platform" queries are dropped by `forgetOwnerQueries` once the
        // screen has unmounted, and the exit banner clears everything again.
        queryClient.removeQueries({ queryKey: viewerKeys.all });
      }
    },
  });
}

/** After navigating away while impersonating: drop the owner's cached lists. */
export function useForgetOwnerQueries() {
  const queryClient = useQueryClient();
  return () => {
    if (!isUiPreview) {
      queryClient.removeQueries({ queryKey: ["platform"] });
    }
  };
}
