import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@hoops-genesis/ui/components/dropdown-menu";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useNavigate } from "@tanstack/react-router";

import { useViewer } from "@/features/viewer/queries";
import { viewerSubtitle } from "@/features/viewer/selectors";
import { authClient } from "@/lib/auth-client";
import { initials } from "@/lib/format";
import { isUiPreview } from "@/lib/preview";

function useSignOut() {
  const navigate = useNavigate();
  return async () => {
    if (!isUiPreview) {
      await authClient.signOut();
    }
    await navigate({ to: "/login" });
  };
}

function MenuItems() {
  const viewer = useViewer();
  const signOut = useSignOut();
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="normal-case tracking-normal">
          {viewer.user.email}
        </DropdownMenuLabel>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
    </>
  );
}

/** Sidebar footer: avatar + name + role line; opens the account menu. */
export function SidebarUserMenu({ tone }: { tone: "light" | "dark" }) {
  const viewer = useViewer();
  const dark = tone === "dark";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full cursor-pointer items-center gap-[10px] rounded-[10px] p-[10px] text-left outline-none focus-visible:ring-2",
          dark
            ? "hover:bg-white/5 focus-visible:ring-white"
            : "hover:bg-white/60 focus-visible:ring-ink"
        )}
      >
        <Avatar size={34} tone={dark ? "white" : "ink"}>
          <AvatarFallback>{initials(viewer.user.name)}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-col">
          <span
            className={cn(
              "truncate font-semibold text-sm leading-[18px]",
              dark ? "text-white" : "text-ink"
            )}
          >
            {viewer.user.name}
          </span>
          <span
            className={cn(
              "truncate text-[13px] leading-4",
              dark ? "text-[#8c8c8c]" : "text-muted"
            )}
          >
            {viewerSubtitle(viewer)}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        <MenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Phone header avatar (36px ink circle); opens the same account menu. */
export function AvatarUserMenu() {
  const viewer = useViewer();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account"
        className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
      >
        <Avatar size={36} tone="ink">
          <AvatarFallback>{initials(viewer.user.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <MenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
