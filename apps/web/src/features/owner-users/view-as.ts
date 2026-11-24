import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";

import { useIsOffline } from "@/components/offline";
import {
  useForgetOwnerQueries,
  useImpersonateUser,
} from "@/features/owner-users/queries";
import type { Id } from "@/features/types";
import { errorMessage } from "@/lib/api-client";

/**
 * "View as": impersonate someone (Better Auth `admin.impersonateUser`, one hour,
 * audited as user.impersonate_start) and open their home. Shared by the Users
 * panel, the person page and the phone academy page ("View as admin").
 */
export function useViewAs(): {
  viewAs: (userId: Id) => void;
  isPending: boolean;
} {
  const navigate = useNavigate();
  const impersonate = useImpersonateUser();
  const forgetOwnerQueries = useForgetOwnerQueries();
  const offline = useIsOffline();
  const viewAs = useCallback(
    (userId: Id) => {
      impersonate.mutate(
        { userId },
        {
          // Preview shows the banner from `?impersonating=1`; for real the session says so.
          onSuccess: async ({ home }) => {
            await navigate({
              href: home === "/app" ? home : `${home}?impersonating=1`,
            });
            forgetOwnerQueries();
          },
          onError: (error) =>
            toast.error(
              errorMessage(error, "Couldn't start viewing as them. Try again.")
            ),
        }
      );
    },
    [impersonate, navigate, forgetOwnerQueries]
  );
  // Offline counts as busy: the button stays disabled until the connection is back.
  return { viewAs, isPending: impersonate.isPending || offline };
}
