/* Query layer for academy settings. Components import from here only. */
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  type AcademySettingsInput,
  getAcademySettings,
  updateAcademySettings,
} from "@/features/academy-settings/api";
import type { Id } from "@/features/types";
import { viewerKeys } from "@/features/viewer/queries";

export type {
  AcademySettings,
  AcademySettingsInput,
} from "@/features/academy-settings/api";

export const academySettingsKeys = {
  detail: (academyId: Id) => ["academies", academyId, "settings"] as const,
};

export function academySettingsQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: academySettingsKeys.detail(academyId),
    queryFn: () => getAcademySettings(academyId),
  });
}

/**
 * Saves and refreshes everything that shows the academy: the viewer (name, time zone
 * in the chrome) and every academy query (setup checklist, schedules in the new zone).
 */
export function useUpdateAcademySettings(academyId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AcademySettingsInput) =>
      updateAcademySettings(academyId, input),
    onSuccess: async (saved) => {
      queryClient.setQueryData(academySettingsKeys.detail(academyId), saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: viewerKeys.all }),
        queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === "academies" &&
            query.queryKey[1] === academyId &&
            query.queryKey[2] !== "settings",
        }),
      ]);
    },
  });
}
