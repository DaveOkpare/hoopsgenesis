import { cn } from "@hoops-genesis/ui/lib/utils";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

import { PlusIcon, UploadIcon } from "@/components/student/icons";
import {
  fileKindLabel,
  formatFileSize,
  UPLOAD_ACCEPT_ATTRIBUTE,
  uploadContentType,
} from "@/features/student-records/upload-rules";

/*
 * File step of "Upload a record" (44B-0). Empty: a dashed drop area that opens the file
 * chooser. Chosen: the file card with a thumbnail and
 * "Retake" (phone) / "Replace" (desktop). The real <input type="file"> stays in the tab
 * order (visually hidden) and the visible parts are its labels.
 */

function PagePlaceholder() {
  return (
    <span
      aria-hidden="true"
      className="flex h-[72px] w-14 shrink-0 flex-col gap-[5px] rounded-sm bg-fog px-2 py-[9px]"
    >
      <span className="h-1 w-[70%] shrink-0 rounded-[2px] bg-[#9A9A9A]" />
      <span className="h-[3px] w-[90%] shrink-0 rounded-[2px] bg-stone" />
      <span className="h-[3px] w-[80%] shrink-0 rounded-[2px] bg-stone" />
      <span className="h-[3px] w-[90%] shrink-0 rounded-[2px] bg-stone" />
      <span className="h-[3px] w-[60%] shrink-0 rounded-[2px] bg-stone" />
    </span>
  );
}

function usePreviewUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file?.type.startsWith("image/")) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url;
}

export function FilePicker({
  id,
  file,
  invalid,
  describedBy,
  hint,
  onChange,
  onBlur,
}: {
  id: string;
  file: File | null;
  invalid: boolean;
  /** What the student types in instead of a file, for the empty state's hint. */
  hint: keyof typeof OPTIONAL_HINT;
  describedBy?: string;
  onChange: (file: File | null) => void;
  onBlur: () => void;
}) {
  const preview = usePreviewUrl(file);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const chosen = event.target.files?.[0];
      if (chosen) {
        onChange(chosen);
      }
      // Let the same file be chosen again after a fix.
      event.target.value = "";
    },
    [onChange]
  );
  const contentType = file ? (uploadContentType(file) ?? file.type) : "";

  return (
    <div className="flex flex-col">
      <input
        accept={UPLOAD_ACCEPT_ATTRIBUTE}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-label={file ? `Replace file, ${file.name}` : "Choose a file"}
        className="peer sr-only"
        id={id}
        onBlur={onBlur}
        onChange={handleChange}
        type="file"
      />
      {file ? (
        <div
          className={cn(
            "flex items-center gap-3 rounded-md border border-line p-3 peer-focus-visible:ring-2 peer-focus-visible:ring-ink",
            invalid && "border-orange-deep"
          )}
        >
          {preview ? (
            <img
              alt=""
              className="h-[72px] w-14 shrink-0 rounded-sm bg-fog object-cover"
              height={72}
              src={preview}
              width={56}
            />
          ) : (
            <PagePlaceholder />
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold text-[15px] text-ink leading-[18px]">
              {fileKindLabel(contentType)} · {file.name}
            </span>
            <span className="text-[13px] text-muted leading-4">
              {formatFileSize(file.size)}
            </span>
          </span>
          <label
            className="cursor-pointer font-semibold text-ink text-sm leading-[18px] underline decoration-1 underline-offset-[3px] hover:decoration-2"
            htmlFor={id}
          >
            <span className="md:hidden">Retake</span>
            <span className="max-md:hidden">Replace</span>
          </label>
        </div>
      ) : (
        <label
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-md border-[#C8C8C8] border-[1.5px] border-dashed p-[14px] transition-colors hover:bg-fog peer-focus-visible:ring-2 peer-focus-visible:ring-ink",
            invalid && "border-orange-deep"
          )}
          htmlFor={id}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fog text-ink">
            <PlusIcon height={18} width={18} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <span className="font-semibold text-[15px] text-ink leading-[18px]">
              Add a photo or PDF (optional)
            </span>
            <span className="text-[13px] text-muted leading-4">
              {OPTIONAL_HINT[hint]}
            </span>
          </span>
        </label>
      )}
    </div>
  );
}

const OPTIONAL_HINT = {
  numbers: "You can send the numbers without a file. Your coach checks them.",
  details: "You can send the details without a file. Your coach checks them.",
} as const;

/**
 * The file step when the server can't take files (503 `storage_not_configured`): no
 * picker, and the record can still be sent with the values typed in (FDO-0).
 */
export function FileUnavailable({
  hint,
}: {
  hint: keyof typeof OPTIONAL_HINT;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-md border-[#C8C8C8] border-[1.5px] border-dashed p-[14px]"
      role="status"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fog text-muted">
        <UploadIcon height={18} width={18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="font-semibold text-[15px] text-ink leading-[18px]">
          Files can’t be added right now
        </span>
        <span className="text-[13px] text-muted leading-4">
          {OPTIONAL_HINT[hint]} Keep the paper copy to show them.
        </span>
      </span>
    </div>
  );
}
