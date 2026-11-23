import { cn } from "@hoops-genesis/ui/lib/utils";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type Ref,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";

import {
  caretForCount,
  formatCode,
  normalizeCode,
  remainingMask,
} from "@/features/join-codes/code-format";

const CODE_CHAR = /[A-Z0-9]/i;

/** Code characters (letters and digits) before `index` in what was typed. */
function countBefore(text: string, index: number): number {
  let count = 0;
  for (const char of text.slice(0, index)) {
    if (CODE_CHAR.test(char)) {
      count += 1;
    }
  }
  return count;
}

/**
 * The big monospace join code box (6WQ-0 / 6WS-0 / 6WU-0). Types or pastes in any case,
 * with or without dashes or spaces, or the whole link; shows "R4KV-7MXE-____" as you
 * type. `value` is the normalized code (no dashes, at most 12 characters).
 *
 * A transparent <input> sits exactly over a drawn copy of the text, so the caret lines
 * up with the characters while the remaining "____" can be painted in grey.
 */
export function CodeInput({
  "aria-describedby": describedBy,
  id,
  invalid = false,
  onChange,
  onEnter,
  ref,
  value,
}: {
  "aria-describedby"?: string;
  id: string;
  invalid?: boolean;
  onChange: (normalized: string) => void;
  onEnter?: () => void;
  ref?: Ref<HTMLInputElement>;
  value: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);
  const formatted = formatCode(value);

  const setRefs = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref]
  );

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input && caret.current !== null && document.activeElement === input) {
      input.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.currentTarget.value;
      const next = normalizeCode(raw);
      const at = event.currentTarget.selectionStart ?? raw.length;
      const typed = Math.min(countBefore(raw, at), next.length);
      // A pasted link: put the caret at the end.
      caret.current = caretForCount(
        raw.length > formatted.length + 1 ? next.length : typed
      );
      onChange(next);
    },
    [formatted.length, onChange]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        onEnter?.();
        return;
      }
      const input = event.currentTarget;
      const start = input.selectionStart ?? 0;
      const isCollapsed = start === input.selectionEnd;
      // Backspace right after a dash deletes the character before the dash.
      if (
        event.key === "Backspace" &&
        isCollapsed &&
        input.value[start - 1] === "-"
      ) {
        event.preventDefault();
        const count = countBefore(input.value, start);
        const next = value.slice(0, count - 1) + value.slice(count);
        caret.current = caretForCount(count - 1);
        onChange(next);
      }
    },
    [onChange, onEnter, value]
  );

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-md border-2 border-ink bg-white px-4 py-[18px] transition-shadow focus-within:shadow-[0_0_0_4px_#1111111a] max-md:px-3",
        invalid &&
          "border-orange-deep bg-[#FFFAF6] focus-within:shadow-[0_0_0_4px_#B8501A26]"
      )}
    >
      <div className="relative w-[calc(14ch+0.84em+2px)] font-mono font-semibold text-[28px] text-ink leading-[34px] tracking-[0.06em] max-md:text-xl max-md:leading-[30px]">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 whitespace-pre"
        >
          {formatted}
          <span className="text-[#C4C4C0]">{remainingMask(value)}</span>
        </span>
        <input
          aria-describedby={describedBy}
          aria-invalid={invalid ? true : undefined}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          className="relative block w-full bg-transparent p-0 text-transparent caret-ink outline-none selection:bg-orange-soft selection:text-transparent"
          enterKeyHint="go"
          id={id}
          inputMode="text"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          ref={setRefs}
          spellCheck={false}
          value={formatted}
        />
      </div>
    </div>
  );
}
