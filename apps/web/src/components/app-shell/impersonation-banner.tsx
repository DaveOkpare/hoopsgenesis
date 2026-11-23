import { Button } from "@hoops-genesis/ui/components/button";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";
import { useStopImpersonating, useViewer } from "@/features/viewer/queries";
import {
  getActiveMembership,
  primaryRole,
  roleLabel,
} from "@/features/viewer/selectors";
import { errorMessage } from "@/lib/api-client";
import { formatTime } from "@/lib/format";

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeWidth="1.6"
      viewBox="0 0 16 16"
      width="18"
    >
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

/**
 * Orange "Viewing as …" bar from "Viewing as an academy admin". The AppShell renders it
 * (plus the 4px orange frame) whenever `viewer.impersonation` is set, so every screen
 * gets it for free. Exit stops impersonating and returns to the owner Users screen, where it started.
 */
export function ImpersonationBanner() {
  const viewer = useViewer();
  const navigate = useNavigate();
  const stop = useStopImpersonating();
  const exit = useCallback(
    () =>
      stop.mutate(undefined, {
        onSuccess: () => navigate({ to: "/owner/users" }),
        onError: (error) =>
          toast.error(errorMessage(error, "Couldn’t stop viewing. Try again.")),
      }),
    [stop, navigate]
  );
  const { impersonation } = viewer;
  if (!impersonation) {
    return null;
  }
  const membership = getActiveMembership(viewer);
  const timeZone = membership?.academy.timezone;
  return (
    <div
      className="sticky top-0 z-50 flex h-[52px] shrink-0 items-center justify-center gap-4 bg-orange px-4 text-ink max-md:gap-3"
      role="status"
    >
      <EyeIcon />
      <p className="min-w-0 truncate text-[15px] leading-[18px]">
        <span className="font-bold">Viewing as {viewer.user.name}</span>
        {membership ? (
          <span className="max-md:hidden">
            {" "}
            · {roleLabel(primaryRole(membership))}, {membership.academy.name} ·
            started by {impersonation.by.name} at{" "}
            {formatTime(impersonation.startedAt, timeZone)}
          </span>
        ) : null}
      </p>
      <Button
        className="shrink-0"
        disabled={stop.isPending}
        onClick={exit}
        size="xs"
      >
        Exit
      </Button>
    </div>
  );
}
