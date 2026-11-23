import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  getSetupChecklist,
  type SetupSnapshot,
  skipSetupStep,
} from "@/features/setup/api";
import type { Id } from "@/features/types";

export type {
  SetupChecklist,
  SetupSnapshot,
  SetupStep,
  SetupStepId,
} from "@/features/setup/api";

export const setupKeys = {
  checklist: (academyId: Id, snapshot: SetupSnapshot) =>
    ["academies", academyId, "setup-checklist", snapshot] as const,
};

export function setupChecklistQueryOptions(
  academyId: Id,
  snapshot: SetupSnapshot = "current"
) {
  return queryOptions({
    queryKey: setupKeys.checklist(academyId, snapshot),
    queryFn: () => getSetupChecklist(academyId, snapshot),
  });
}

export function useSkipSetupStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: skipSetupStep,
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: setupKeys.checklist(input.academyId, input.snapshot),
      });
    },
  });
}
