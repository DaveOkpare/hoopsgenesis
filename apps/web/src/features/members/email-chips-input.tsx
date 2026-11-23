import { cn } from "@hoops-genesis/ui/lib/utils";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
  useCallback,
} from "react";

export type EmailStatus = "ok" | "member" | "invited" | "invalid";

const SEPARATORS = /[\s,;]+/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL.test(value);
}

/** Splits pasted or typed text into lower-cased, de-duplicated emails. */
export function splitEmails(text: string, existing: string[] = []): string[] {
  const seen = new Set(existing);
  const out: string[] = [];
  for (const part of text.split(SEPARATORS)) {
    const email = part.trim().toLowerCase();
    if (email && !seen.has(email)) {
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}

const WARNING: Record<Exclude<EmailStatus, "ok">, string> = {
  member: "already a member",
  invited: "already invited",
  invalid: "not an email",
};

function ChipClose() {
  return (
    <svg aria-hidden="true" height="10" viewBox="0 0 12 12" width="10">
      <path
        d="M2 2l8 8M10 2L2 10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

/**
 * Several emails in one box (Invite people, 2HB-0 / 5U1-0). Typing a space, comma or
 * Enter turns the text into a chip; pasting a list adds them all. Emails that can't be
 * invited show as an orange chip with the reason and are not counted.
 */
export function EmailChipsInput({
  id,
  emails,
  draft,
  onDraftChange,
  onEmailsChange,
  statusFor,
  placeholder,
  invalid,
  describedBy,
  inputRef,
}: {
  id: string;
  emails: string[];
  draft: string;
  onDraftChange: (draft: string) => void;
  onEmailsChange: (emails: string[]) => void;
  statusFor: (email: string) => EmailStatus;
  placeholder: string;
  invalid?: boolean;
  describedBy?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const commit = useCallback(
    (text: string) => {
      const added = splitEmails(text, emails);
      if (added.length > 0) {
        onEmailsChange([...emails, ...added]);
      }
      onDraftChange("");
    },
    [emails, onDraftChange, onEmailsChange]
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target;
      if (SEPARATORS.test(value)) {
        commit(value);
        return;
      }
      onDraftChange(value);
    },
    [commit, onDraftChange]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && draft.trim()) {
        event.preventDefault();
        commit(draft);
        return;
      }
      if (event.key === "Backspace" && !draft && emails.length > 0) {
        onEmailsChange(emails.slice(0, -1));
      }
    },
    [commit, draft, emails, onEmailsChange]
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      const text = event.clipboardData.getData("text");
      if (SEPARATORS.test(text.trim())) {
        event.preventDefault();
        commit(`${draft} ${text}`);
      }
    },
    [commit, draft]
  );

  const handleBlur = useCallback(() => {
    if (draft.trim()) {
      commit(draft);
    }
  }, [commit, draft]);

  const handleRemove = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const { email } = event.currentTarget.dataset;
      onEmailsChange(emails.filter((e) => e !== email));
    },
    [emails, onEmailsChange]
  );

  return (
    <div
      className={cn(
        "flex min-h-[88px] w-full cursor-text flex-wrap content-start gap-[6px] rounded-[14px] border-2 border-line bg-white p-[10px] transition-colors focus-within:border-ink",
        "max-md:min-h-0 max-md:gap-2 max-md:rounded-md max-md:p-3",
        invalid && "border-orange-deep"
      )}
    >
      <ul aria-label="Emails to invite" className="contents">
        {emails.map((email) => {
          const status = statusFor(email);
          const ok = status === "ok";
          return (
            <li className="contents" key={email}>
              <span
                className={cn(
                  "inline-flex items-center gap-[6px] rounded-full py-[6px] pr-[6px] pl-[10px] text-sm leading-[18px]",
                  ok ? "bg-fog text-ink" : "bg-orange-soft text-orange-deep"
                )}
              >
                {ok ? email : `${email} · ${WARNING[status]}`}
                <button
                  aria-label={`Remove ${email}`}
                  className={cn(
                    "flex size-4 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ink",
                    ok ? "text-muted hover:text-ink" : "text-orange-deep"
                  )}
                  data-email={email}
                  onClick={handleRemove}
                  type="button"
                >
                  <ChipClose />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <input
        aria-describedby={describedBy}
        aria-invalid={invalid ? true : undefined}
        autoComplete="off"
        className="min-w-[140px] flex-1 bg-transparent px-1 py-[6px] text-ink text-sm leading-[18px] outline-none placeholder:text-muted max-md:placeholder:text-[#B5B5B5]"
        id={id}
        inputMode="email"
        onBlur={handleBlur}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder}
        ref={inputRef}
        type="text"
        value={draft}
      />
    </div>
  );
}
