/* Query layer for the owner console. Components import from here, never api.ts. */
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createAcademy,
  getPlatformAcademy,
  listPlatformAcademies,
  OWNER_CAN_REPLACE_QR as ownerCanReplaceQr,
  type PlatformAcademy,
  regenerateAcademyQr,
  searchPlaces,
} from "@/features/owner-academies/api";
import type { Id } from "@/features/types";

export type {
  AcademyActivity,
  CreateAcademyInput,
  Place,
  PlatformAcademy,
  PlatformAcademyDetail,
  PlatformAcademyStatus,
} from "@/features/owner-academies/api";

export const platformAcademyKeys = {
  all: ["platform", "academies"] as const,
  detail: (academyId: Id) =>
    [...platformAcademyKeys.all, "detail", academyId] as const,
  places: ["platform", "places"] as const,
};

export function platformAcademiesQueryOptions() {
  return queryOptions({
    queryKey: platformAcademyKeys.all,
    queryFn: listPlatformAcademies,
  });
}

export function platformAcademyQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: platformAcademyKeys.detail(academyId),
    queryFn: () => getPlatformAcademy(academyId),
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
    : [...list, row];
}

/** PA-1: create the academy and invite its first admin. */
export function useCreateAcademy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAcademy,
    onSuccess: async (row) => {
      queryClient.setQueryData<PlatformAcademy[]>(
        platformAcademyKeys.all,
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
        platformAcademyKeys.all,
        (list) => upsert(list, row)
      );
      // The detail key sits under `all`, so this refetches the panel too.
      await queryClient.invalidateQueries({
        queryKey: platformAcademyKeys.all,
      });
    },
  });
}

/** Whether the console offers "Replace QR code" (no owner endpoint; preview only). */
export const OWNER_CAN_REPLACE_QR: boolean = ownerCanReplaceQr;
