import { AvatarUserMenu } from "@/components/app-shell/user-menu";

/**
 * Phone header row on the owner's tab screens (Paper DKC-0, E62-0, E84-0 "Top Row"):
 * the ink "Owner" chip and the account avatar. Hidden from md up.
 */
export function OwnerPhoneBar() {
  return (
    <div className="flex items-center justify-between md:hidden">
      <span className="flex items-center gap-2 rounded-full bg-ink py-[6px] pr-3 pl-[6px] font-semibold text-sm text-white leading-[18px]">
        <span
          aria-hidden="true"
          className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-orange font-display text-[11px] text-ink leading-[14px]"
        >
          HG
        </span>
        Owner
      </span>
      <AvatarUserMenu tone="brand" />
    </div>
  );
}
