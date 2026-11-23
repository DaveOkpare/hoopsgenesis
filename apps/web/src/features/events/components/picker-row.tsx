import { cn } from "@hoops-genesis/ui/lib/utils";
import { type MouseEvent, type ReactNode, useCallback } from "react";

/** Opens the browser's own date/time picker when the visible value is clicked. */
function openPicker(event: MouseEvent<HTMLInputElement>) {
  try {
    event.currentTarget.showPicker();
  } catch {
    // Older browsers: the focused input still accepts typing.
  }
}

export const rowClass =
  "relative flex items-center justify-between gap-3 border-line border-b py-[14px] last:border-b-0";
export const rowLabelClass = "text-[15px] text-muted leading-[18px]";
export const rowValueClass =
  "flex items-center gap-1 font-medium text-[15px] text-ink leading-[18px]";

/**
 * A native date or time input drawn as the "Wed 25 Nov ›" value of a settings row
 * (3QV-0). The input sits invisibly over the value, so keyboard and screen readers get
 * the real control and pointer users get the system picker.
 */
export function PickerValue({
  id,
  type,
  value,
  display,
  label,
  min,
  invalid,
  onValue,
  className,
}: {
  id: string;
  type: "date" | "time";
  value: string;
  display: ReactNode;
  label: string;
  min?: string;
  invalid?: boolean;
  onValue: (value: string) => void;
  className?: string;
}) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => onValue(event.target.value),
    [onValue]
  );
  return (
    <span
      className={cn(
        "relative inline-flex rounded-[6px] focus-within:ring-2 focus-within:ring-ink focus-within:ring-offset-2",
        invalid && "text-orange-deep",
        className
      )}
    >
      <span aria-hidden="true" className="flex min-w-0 flex-1">
        {display}
      </span>
      <input
        aria-invalid={invalid ? true : undefined}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        id={id}
        min={min}
        onChange={handleChange}
        onClick={openPicker}
        type={type}
        value={value}
      />
    </span>
  );
}

export function Chevron() {
  return (
    <span aria-hidden="true" className="font-medium">
      ›
    </span>
  );
}
