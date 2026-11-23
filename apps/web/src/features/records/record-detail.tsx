/* The right-hand review pane (desktop) / full-screen review page (phone) of 1PT-0. */
import { Button } from "@hoops-genesis/ui/components/button";
import { Checkbox } from "@hoops-genesis/ui/components/checkbox";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useId } from "react";

import {
  isSelfUpload,
  recordFields,
  recordFileName,
  recordProvenance,
  recordTitle,
} from "@/features/records/describe";
import type { ReviewItem } from "@/features/records/queries";
import { firstName } from "@/lib/format";

const DOC_LINES = ["45%", "38%", "50%", "42%", "35%", "48%"];

export function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height="18"
      viewBox="0 0 18 18"
      width="18"
    >
      <path
        d="M4 1.8h6.5L14 5.3v10.9H4z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M7 9h4M7 12h4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function PhotoIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height="18"
      viewBox="0 0 18 18"
      width="18"
    >
      <path
        d="M3 15l3.5-5 3 3 2.5-4 3 6z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <circle
        cx="6"
        cy="5"
        fill="none"
        r="1.6"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** Stand-in for the inline file viewer (the signed file URL isn't available in mocks). */
function DocumentPreview({ label }: { label: string }) {
  return (
    <div
      aria-label={label}
      className="flex w-[300px] max-w-full shrink-0 flex-col gap-3 bg-white px-[22px] py-6 shadow-[0_2px_10px_#11111114]"
      role="img"
    >
      <div className="h-[10px] w-[60%] rounded-[3px] bg-ink-soft" />
      <div className="h-[7px] w-[40%] rounded-[3px] bg-[#C8C8C8]" />
      <div className="flex flex-col gap-[9px] pt-3">
        {DOC_LINES.map((width) => (
          <div className="flex justify-between" key={width}>
            <div className="h-[7px] rounded-[3px] bg-stone" style={{ width }} />
            <div className="h-[7px] w-[12%] rounded-[3px] bg-ink-soft" />
          </div>
        ))}
      </div>
      <div className="flex justify-between border-line border-t pt-[14px]">
        <div className="h-2 w-[30%] rounded-[3px] bg-ink-soft" />
        <div className="h-2 w-[14%] rounded-[3px] bg-ink" />
      </div>
      <div className="h-9 w-20 self-end rounded-full border-2 border-[#C8C8C8]" />
    </div>
  );
}

function Preview({ item }: { item: ReviewItem }) {
  const hasDocument = item.recordType === "academic";
  return (
    <div
      className={cn(
        "flex flex-[1.3] basis-0 justify-center rounded-[14px] bg-fog p-6 max-md:flex-none max-md:basis-auto max-md:p-5",
        !hasDocument && "self-start"
      )}
    >
      {hasDocument ? (
        <DocumentPreview
          label={`${recordFileName(item) ?? recordTitle(item)}, preview`}
        />
      ) : (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-muted text-sm leading-[18px]">
          <PhotoIcon className="size-6 text-ink" />
          No file attached. {firstName(item.recordedByName)} entered the result
          by hand.
        </div>
      )}
    </div>
  );
}

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      className="mt-px shrink-0"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <circle
        cx="8"
        cy="8"
        fill="none"
        r="6.5"
        stroke="#6B6B6B"
        strokeWidth="1.4"
      />
      <path
        d="M8 7v4M8 5v.1"
        fill="none"
        stroke="#6B6B6B"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function StatusNote({ item }: { item: ReviewItem }) {
  if (item.status === "verified") {
    return (
      <p className="font-semibold text-sm text-success leading-[18px]">
        Verified. This record is final.
      </p>
    );
  }
  if (item.status === "rejected") {
    return (
      <p className="text-ink-soft text-sm leading-[18px]">
        <span className="font-semibold text-orange-deep">Rejected.</span>{" "}
        {item.reviewNote ? `“${item.reviewNote}”` : null}
      </p>
    );
  }
  return null;
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
      <path
        d="M3.5 8.2l3 3 6-6.4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function RecordHeader({
  item,
  position,
  timeZone,
  className,
}: {
  item: ReviewItem;
  position: string | null;
  timeZone: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-line border-b px-6 py-5",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-[2px]">
        <h2 className="font-semibold text-ink text-lg leading-[22px]">
          {item.student.name} · {recordTitle(item)}
        </h2>
        <p className="text-muted text-sm leading-[18px]">
          {recordProvenance(item, timeZone)}
        </p>
      </div>
      {position ? (
        <p className="shrink-0 text-muted text-sm leading-[18px]">{position}</p>
      ) : null}
    </div>
  );
}

export function RecordBody({ item }: { item: ReviewItem }) {
  const fields = recordFields(item);
  const enteredBy = isSelfUpload(item)
    ? firstName(item.student.name)
    : firstName(item.recordedByName);
  const hasFile = item.recordType === "academic";
  return (
    <div className="flex flex-1 gap-5 p-6 max-md:flex-col max-md:p-0">
      <Preview item={item} />
      <div className="flex flex-1 basis-0 flex-col gap-[18px] max-md:basis-auto">
        <h3 className="font-semibold text-[13px] text-muted uppercase leading-4 tracking-label">
          What {enteredBy} entered
        </h3>
        <dl className="flex flex-col">
          {fields.map((field) => (
            <div
              className="flex justify-between gap-4 border-line border-b py-[11px] text-[15px] leading-[18px] last:border-b-0"
              key={field.label}
            >
              <dt className="text-muted">{field.label}</dt>
              <dd className="text-right font-medium text-ink">{field.value}</dd>
            </div>
          ))}
        </dl>
        {item.status === "pending" ? (
          <div className="flex gap-[10px] rounded-[12px] bg-fog p-[14px]">
            <InfoIcon />
            <p className="text-ink-soft text-sm leading-body">
              {hasFile
                ? "Check the numbers match the file. Once verified, the record is final."
                : "Check the numbers look right. Once verified, the record is final."}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RecordActions({
  item,
  canDecide,
  busy,
  advance,
  onAdvanceChange,
  onVerify,
  onReject,
  className,
}: {
  item: ReviewItem;
  canDecide: boolean;
  busy: boolean;
  advance: boolean;
  onAdvanceChange: (checked: boolean) => void;
  onVerify: () => void;
  onReject: () => void;
  className?: string;
}) {
  const checkboxId = useId();
  if (item.status !== "pending") {
    return (
      <div
        className={cn(
          "flex items-center border-line border-t px-6 py-4",
          className
        )}
      >
        <StatusNote item={item} />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-line border-t px-6 py-4",
        "max-md:flex-col-reverse max-md:items-stretch max-md:border-0 max-md:px-5 max-md:pt-2 max-md:pb-[max(24px,env(safe-area-inset-bottom))]",
        className
      )}
    >
      <div className="flex items-center gap-2 max-md:justify-center">
        <Checkbox
          checked={advance}
          id={checkboxId}
          onCheckedChange={onAdvanceChange}
        />
        <label
          className="cursor-pointer text-ink-soft text-sm leading-[18px]"
          htmlFor={checkboxId}
        >
          Open the next one after I decide
        </label>
      </div>
      {canDecide ? (
        <div className="flex gap-2 max-md:flex-col-reverse">
          <Button
            className="px-[22px] max-md:py-[17px] max-md:text-[17px]"
            disabled={busy}
            onClick={onReject}
            variant="outline"
          >
            Reject…
          </Button>
          <Button
            className="px-[22px] max-md:py-[17px] max-md:text-[17px]"
            disabled={busy}
            onClick={onVerify}
          >
            <CheckIcon />
            {busy ? "Saving…" : "Verify"}
          </Button>
        </div>
      ) : (
        <p className="text-muted text-sm leading-[18px]">
          You entered this record, so someone else reviews it.
        </p>
      )}
    </div>
  );
}
