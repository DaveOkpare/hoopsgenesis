import { Button } from "@hoops-genesis/ui/components/button";
import {
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@hoops-genesis/ui/components/dialog";
import { useCallback } from "react";

import { copyWithToast, shareMessage } from "@/features/join-codes/copy";
import {
  codeFor,
  codeSummary,
  limitsSummary,
  shareMessage as messageFor,
} from "@/features/join-codes/describe";
import {
  CheckIcon,
  CopyIcon,
  LinkIcon,
  ShareIcon,
} from "@/features/join-codes/icons";
import type { InvitationCode } from "@/features/join-codes/queries";
import { useIsPhone } from "@/lib/use-is-phone";

const codeBox =
  "flex justify-center rounded-[20px] border-2 border-[#D0D0CC] border-dashed bg-fog font-mono font-semibold text-ink tracking-[0.04em]";

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "Code ready" after creating a code: desktop 6RV-0 (centred, ready-to-paste message),
 * phone 6WV-0 (full-screen, share button). Rendered inside NewCodeDialog.
 */
export function CodeReady({
  academyName,
  code,
  onDone,
  timeZone,
}: {
  academyName: string;
  code: InvitationCode;
  onDone: () => void;
  timeZone: string;
}) {
  const isPhone = useIsPhone();
  const summaryInput = {
    role: code.role,
    teamName: code.team?.name ?? null,
    maxUses: code.maxUses,
    expiresAt: code.expiresAt,
    timeZone,
  };
  const desktopMessage = messageFor({
    academyName,
    code,
    includeCode: true,
    timeZone,
  });
  const phoneMessage = messageFor({
    academyName,
    code,
    includeCode: false,
    timeZone,
  });

  const copyCode = useCallback(
    () => copyWithToast(code.code, "Code copied"),
    [code.code]
  );
  const copyLink = useCallback(
    () => copyWithToast(code.link, "Link copied"),
    [code.link]
  );
  const copyMessage = useCallback(
    () => copyWithToast(desktopMessage, "Message copied"),
    [desktopMessage]
  );
  const share = useCallback(() => shareMessage(phoneMessage), [phoneMessage]);

  if (isPhone) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Join code ready</DialogTitle>
        </DialogHeader>
        <DialogBody className="gap-[18px] pt-2">
          <div className="flex flex-col gap-1">
            <p className="font-medium text-[13px] text-muted uppercase leading-4 tracking-label">
              {codeFor(code)}
            </p>
            <p className="text-ink-soft text-sm leading-[19px]">
              {capitalize(limitsSummary(summaryInput))}
            </p>
          </div>
          <p
            className={`${codeBox} px-[10px] py-[26px] text-[28px] leading-[34px]`}
          >
            {code.code}
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1 basis-0 border-ink p-[14px] text-[15px] leading-5"
              onClick={copyCode}
              variant="outline"
            >
              Copy code
            </Button>
            <Button
              className="flex-1 basis-0 border-ink p-[14px] text-[15px] leading-5"
              onClick={copyLink}
              variant="outline"
            >
              Copy link
            </Button>
          </div>
          <div className="flex flex-col gap-[6px] rounded-md border border-line p-[14px]">
            <p className="font-medium text-muted text-xs uppercase leading-4 tracking-label">
              Message that gets shared
            </p>
            <p className="text-ink-soft text-sm leading-5">{phoneMessage}</p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button className="gap-[10px] p-[18px]" onClick={share}>
            <ShareIcon className="size-[18px]" />
            Share on WhatsApp or SMS
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col items-center gap-[18px] px-8 pt-9 pb-7">
        <span className="flex size-14 items-center justify-center rounded-full bg-[#E5F5EC] text-success">
          <CheckIcon />
        </span>
        <div className="flex flex-col items-center gap-[6px] text-center">
          <DialogTitle className="text-[36px] leading-[38px]">
            Code ready
          </DialogTitle>
          <p className="text-muted text-sm leading-5">
            {codeSummary(summaryInput)}
          </p>
        </div>
        <p
          className={`${codeBox} self-stretch px-4 py-[22px] text-[38px] leading-[44px]`}
        >
          {code.code}
        </p>
        <div className="flex gap-2 self-stretch">
          <Button
            className="flex-1 basis-0 p-[14px] text-[15px] leading-5"
            onClick={copyCode}
          >
            <CopyIcon />
            Copy code
          </Button>
          <Button
            className="flex-1 basis-0 border-ink p-[14px] text-[15px] leading-5"
            onClick={copyLink}
            variant="outline"
          >
            <LinkIcon />
            Copy link
          </Button>
        </div>
        <div className="flex flex-col gap-[6px] self-stretch rounded-md border border-line px-4 py-[14px]">
          <p className="font-medium text-muted text-xs uppercase leading-4 tracking-label">
            Ready-to-paste message
          </p>
          <p className="text-ink-soft text-sm leading-[21px]">
            {desktopMessage}
          </p>
          <Button
            className="w-fit text-sm leading-[18px]"
            onClick={copyMessage}
            variant="link"
          >
            Copy message
          </Button>
        </div>
      </div>
      <DialogFooter className="justify-between px-8 py-4">
        <p className="text-[13px] text-muted leading-[18px]">
          You can see this code again under Members → Join codes.
        </p>
        <Button
          className="h-auto px-0 py-0 text-[15px] leading-5 hover:bg-transparent hover:underline"
          onClick={onDone}
          variant="ghost"
        >
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
