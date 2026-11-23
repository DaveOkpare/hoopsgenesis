/* Query layer for the owner Users screen. Components import from here, never api.ts. */
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  banUser,
  impersonateUser,
  listUserSessions,
  listUsers,
  revokeUserSessions,
  unbanUser,
} from "@/features/owner-users/api";
import type { Id } from "@/features/types";

export type {
  PlatformUser,
  PlatformUserMembership,
  UserSession,
} from "@/features/owner-users/api";

export const platformUserKeys = {
  all: ["platform", "users"] as const,
  search: (searchValue: string) =>
    [...platformUserKeys.all, "search", searchValue] as const,
  sessions: (userId: Id) =>
    [...platformUserKeys.all, "sessions", userId] as const,
};

export function platformUsersQueryOptions(searchValue: string) {
  return queryOptions({
    queryKey: platformUserKeys.search(searchValue.trim().toLowerCase()),
    queryFn: () => listUsers({ searchValue }),
    placeholderData: keepPreviousData,
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

export function useImpersonateUser() {
  return useMutation({ mutationFn: impersonateUser });
}
