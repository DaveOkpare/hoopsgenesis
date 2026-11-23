/*
 * Academy QR code (1SE-0). The poster is printed with window.print(); the print
 * stylesheet below hides everything except the poster and fits it to an A4 page.
 */
import { Button } from "@hoops-genesis/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@hoops-genesis/ui/components/dialog";
import {
  Eyebrow,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useCallback } from "react";
import { toast } from "sonner";

import {
  type AcademyQrDetails,
  academyQrQueryOptions,
  useRegenerateAcademyQr,
} from "@/features/academy-qr/queries";
import type { Id } from "@/features/types";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";
import { formatDayMonth } from "@/lib/format";

export interface QrSearch {
  replace?: 1;
}

export function parseQrSearch(raw: Record<string, unknown>): QrSearch {
  return { replace: raw.replace === 1 || raw.replace === "1" ? 1 : undefined };
}

const POSTER_ID = "academy-qr-poster";

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body { background: #111111 !important; }
  body * { visibility: hidden !important; }
  #${POSTER_ID}, #${POSTER_ID} * { visibility: visible !important; }
  #${POSTER_ID} {
    position: fixed !important;
    inset: 0 !important;
    width: 100% !important;
    max-width: none !important;
    justify-content: center !important;
    gap: 36px !important;
    box-shadow: none !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    zoom: 1.4;
  }
}
`;

function Poster({ qr }: { qr: AcademyQrDetails }) {
  return (
    <div
      aria-label={`Check-in poster for ${qr.academyName}`}
      className="flex w-[420px] max-w-full shrink-0 flex-col items-center gap-[22px] bg-ink px-9 py-10 shadow-[0_6px_24px_#1111112E] max-md:px-6 max-md:py-8"
      id={POSTER_ID}
      role="img"
    >
      <div className="flex items-center gap-[10px]">
        <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-orange font-display text-[15px] text-ink leading-[18px]">
          HG
        </div>
        <p className="font-display text-[20px] text-white uppercase leading-6">
          {qr.academyName}
        </p>
      </div>
      <p className="text-center font-display text-[64px] text-white uppercase leading-[90%] max-md:text-[56px]">
        Scan to
        <br />
        <span className="text-orange">check in</span>
      </p>
      <div className="rounded-md bg-white p-[18px]">
        <QRCodeSVG
          fgColor="#111111"
          level="M"
          marginSize={0}
          size={220}
          title={`Check-in code for ${qr.academyName}`}
          value={qr.deepLink}
        />
      </div>
      <div className="flex w-full flex-col gap-2 text-center text-[#D0D0D0] text-[15px] leading-[140%]">
        <p>
          1. Open the Hoops Genesis app and tap{" "}
          <span className="font-semibold text-white">Check in</span> on your
          session
        </p>
        <p>2. Scan this code. Your location confirms you’re here.</p>
      </div>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
      <path
        d="M8 2v8M4.5 7L8 10.5 11.5 7M3 13.5h10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function lastReplacedLabel(
  qr: AcademyQrDetails,
  viewerId: Id,
  timeZone: string
): string {
  if (!qr.lastRegeneratedAt) {
    return "Never";
  }
  const day = formatDayMonth(qr.lastRegeneratedAt, timeZone);
  if (!qr.lastRegeneratedBy) {
    return day;
  }
  return qr.lastRegeneratedBy.id === viewerId
    ? `${day} by you`
    : `${day} by ${qr.lastRegeneratedBy.name}`;
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-line border-b py-3 text-sm leading-[18px] last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

function ReplaceDialog({
  open,
  busy,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="md:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Replace the code?</DialogTitle>
          <DialogDescription className="leading-body max-md:leading-body">
            Replacing it stops every printed copy from working straight away.
            You’ll need to print and put up the new poster.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 max-md:mt-2">
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button
            className="px-[22px]"
            disabled={busy}
            onClick={onConfirm}
            variant="destructive"
          >
            {busy ? "Replacing…" : "Replace code"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AcademyQrScreen({
  search,
  onSearchChange,
}: {
  search: QrSearch;
  onSearchChange: (patch: Partial<QrSearch>) => void;
}) {
  const viewer = useViewer();
  const membership = useActiveMembership();
  const academyId = membership?.academy.id ?? "";
  const timeZone = membership?.academy.timezone ?? "UTC";
  const qr = useQuery(academyQrQueryOptions(academyId));
  const regenerate = useRegenerateAcademyQr(academyId);

  const handlePrint = useCallback(() => window.print(), []);
  const handleOpenReplace = useCallback(
    () => onSearchChange({ replace: 1 }),
    [onSearchChange]
  );
  const handleReplaceOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onSearchChange({ replace: undefined });
      }
    },
    [onSearchChange]
  );
  const handleConfirm = useCallback(async () => {
    try {
      await regenerate.mutateAsync();
      toast.success("New code ready", {
        description:
          "Print the poster and put it up. Old prints no longer work.",
      });
      onSearchChange({ replace: undefined });
    } catch {
      toast.error("The code couldn't be replaced. Try again.");
    }
  }, [onSearchChange, regenerate]);

  return (
    <>
      <style>{PRINT_CSS}</style>
      <PageHeader>
        <PageHeading>
          <Eyebrow>Check-in code for the venue</Eyebrow>
          <PageTitle>Academy QR code</PageTitle>
        </PageHeading>
      </PageHeader>

      <div className="flex items-start gap-4 max-lg:flex-col max-lg:items-stretch">
        <section
          aria-label="Poster preview"
          className="flex flex-1 basis-0 justify-center rounded-[20px] bg-fog p-10 max-md:p-4 max-lg:basis-auto"
        >
          {qr.data ? (
            <Poster qr={qr.data} />
          ) : (
            <Skeleton className="h-[623px] w-[420px] max-w-full rounded-none" />
          )}
        </section>

        <div className="flex w-[380px] shrink-0 flex-col gap-4 max-lg:w-full">
          <section className="flex flex-col gap-4 rounded-[20px] border border-line p-6 max-md:p-5">
            <div className="flex flex-col gap-1">
              <h2 className="font-semibold text-ink text-lg leading-[22px]">
                Print the poster
              </h2>
              <p className="text-[15px] text-muted leading-body">
                A4 PDF with your academy name and short instructions. Put it up
                at the entrance.
              </p>
            </div>
            <Button
              className="w-full py-[14px]"
              disabled={!qr.data}
              onClick={handlePrint}
            >
              <DownloadIcon />
              Download PDF to print
            </Button>
          </section>

          {qr.data ? (
            <dl className="flex flex-col rounded-[20px] bg-fog px-6 py-2">
              <FactRow
                label="Check-in radius"
                value={`${qr.data.radiusM} m from the academy`}
              />
              <FactRow
                label="Check-in window"
                value={`${qr.data.checkInWindow.minutesBefore} min before → ${qr.data.checkInWindow.minutesAfter} min after`}
              />
              <FactRow
                label="Code last replaced"
                value={lastReplacedLabel(qr.data, viewer.user.id, timeZone)}
              />
            </dl>
          ) : (
            <Skeleton className="h-[144px] rounded-[20px]" />
          )}

          <section className="flex flex-col gap-[14px] rounded-[20px] border border-[#F3C9AD] bg-[#FFF8F3] p-6 max-md:p-5">
            <div className="flex flex-col gap-1">
              <h2 className="font-semibold text-base text-ink leading-5">
                Code leaked or misused?
              </h2>
              <p className="text-ink-soft text-sm leading-body">
                Replacing it stops every printed copy from working straight
                away. You’ll need to print and put up the new poster.
              </p>
            </div>
            <Button
              className="self-start px-[18px] py-[11px]"
              disabled={!qr.data}
              onClick={handleOpenReplace}
              size="sm"
              variant="destructive-outline"
            >
              Replace code…
            </Button>
          </section>
        </div>
      </div>

      <ReplaceDialog
        busy={regenerate.isPending}
        onConfirm={handleConfirm}
        onOpenChange={handleReplaceOpenChange}
        open={Boolean(search.replace)}
      />
    </>
  );
}
