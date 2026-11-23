import { cn } from "@hoops-genesis/ui/lib/utils";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

import { UploadIcon } from "@/components/student/icons";
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
  onChange,
  onBlur,
}: {
  id: string;
  file: File | null;
  invalid: boolean;
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
            "flex cursor-pointer flex-col items-center gap-2 rounded-md border-[1.5px] border-stone border-dashed px-5 py-7 text-center transition-colors hover:bg-fog peer-focus-visible:ring-2 peer-focus-visible:ring-ink",
            invalid && "border-orange-deep"
          )}
          htmlFor={id}
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-fog text-ink">
            <UploadIcon height={18} width={18} />
          </span>
          <span className="font-semibold text-[15px] text-ink leading-5">
            <span className="md:hidden">Take a photo or choose a PDF</span>
            <span className="max-md:hidden">
              Choose a PDF or photo from your computer
            </span>
          </span>
          <span className="text-[13px] text-muted leading-4">
            PDF, JPEG or PNG · up to 10 MB
          </span>
        </label>
      )}
    </div>
  );
}
