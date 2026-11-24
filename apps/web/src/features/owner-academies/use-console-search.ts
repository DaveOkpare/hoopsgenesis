import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import type { ConsoleSearchChange } from "@/features/owner-academies/academy-console";

/**
 * Updates the console's search params in place (replace, so typing in the search box
 * does not fill the history). Any change but a page change goes back to page 1.
 */
export function useConsoleSearchChange(
  from: "/owner/" | "/owner/academies/$academyId"
): ConsoleSearchChange {
  const navigate = useNavigate({ from });
  return useCallback(
    (patch, options) => {
      const resetPage = options?.resetPage ?? true;
      navigate({
        search: (prev) => ({
          ...prev,
          ...(resetPage ? { page: undefined } : {}),
          ...patch,
        }),
        replace: true,
      });
    },
    [navigate]
  );
}
