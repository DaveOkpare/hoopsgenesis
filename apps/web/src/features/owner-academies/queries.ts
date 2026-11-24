/* Query layer for the owner console. Components import from here, never api.ts. */
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  appointAcademyAdmin,
  createAcademy,
  getAcademyRoleCounts,
  getPlatformAcademy,
  listPlatformAcademies,
  OWNER_CAN_REPLACE_QR as ownerCanReplaceQr,
  type PlatformAcademy,
  regenerateAcademyQr,
  removeAcademyAdmin,
  searchPlaces,
} from "@/features/owner-academies/api";
import type { Id } from "@/features/types";

export type {
  AcademyActivity,
  AcademyAdmin,
  AcademyAdminPerson,
  AcademyRoleCounts,
  AdminAppointment,
  CreateAcademyInput,
  Place,
  PlatformAcademy,
  PlatformAcademyDetail,
  PlatformAcademyStatus,
} from "@/features/owner-academies/api";

export const platformAcademyKeys = {
  all: ["platform", "academies"] as const,
  list: () => [...platformAcademyKeys.all, "list"] as const,
  detail: (academyId: Id) =>
    [...platformAcademyKeys.all, "detail", academyId] as const,
  roles: (academyId: Id) =>
    [...platformAcademyKeys.all, "roles", academyId] as const,
  places: ["platform", "places"] as const,
};

/** Every academy (all pages of the list endpoint; it has no search or filters). */
export function platformAcademiesQueryOptions() {
  return queryOptions({
    queryKey: platformAcademyKeys.list(),
    queryFn: listPlatformAcademies,
  });
}

export function platformAcademyQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: platformAcademyKeys.detail(academyId),
    queryFn: () => getPlatformAcademy(academyId),
  });
}

/** Admins, coaches and students of one academy (one console row). */
export function academyRoleCountsQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: platformAcademyKeys.roles(academyId),
    queryFn: () => getAcademyRoleCounts(academyId),
    staleTime: 60_000,
  });
}

export function placesQueryOptions() {
  return queryOptions({
    queryKey: platformAcademyKeys.places,
    queryFn: searchPlaces,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

function upsert(list: PlatformAcademy[] | undefined, row: PlatformAcademy) {
  if (!list) {
    return list;
  }
  const exists = list.some((r) => r.academy.id === row.academy.id);
  return exists
    ? list.map((r) => (r.academy.id === row.academy.id ? row : r))
    : [row, ...list];
}

/** PA-1: create the academy and invite its first admin. */
export function useCreateAcademy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAcademy,
    onSuccess: async (row) => {
      queryClient.setQueryData<PlatformAcademy[]>(
        platformAcademyKeys.list(),
        (list) => upsert(list, row)
      );
      await queryClient.invalidateQueries({
        queryKey: platformAcademyKeys.all,
      });
    },
  });
}

/** PA-3: replace the academy's QR code (every printed copy stops working). */
export function useRegenerateAcademyQr() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: regenerateAcademyQr,
    onSuccess: async (row) => {
      queryClient.setQueryData<PlatformAcademy[]>(
        platformAcademyKeys.list(),
        (list) => upsert(list, row)
      );
      await queryClient.invalidateQueries({
        queryKey: platformAcademyKeys.all,
      });
    },
  });
}

/**
 * Admin changes touch the academy (counts, admin names), the person (memberships)
 * and the audit log, so all of the owner's cached views refetch.
 */
function useRefreshPlatform() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["platform"] });
}

/** PA-2: make someone an admin of an academy (owner only). */
export function useAppointAcademyAdmin() {
  const refresh = useRefreshPlatform();
  return useMutation({ mutationFn: appointAcademyAdmin, onSuccess: refresh });
}

/** PA-2: take away someone's admin role in an academy (owner only). */
export function useRemoveAcademyAdmin() {
  const refresh = useRefreshPlatform();
  return useMutation({ mutationFn: removeAcademyAdmin, onSuccess: refresh });
}

/** Whether the console offers "Replace QR code" (no owner endpoint; preview only). */
export const OWNER_CAN_REPLACE_QR: boolean = ownerCanReplaceQr;
