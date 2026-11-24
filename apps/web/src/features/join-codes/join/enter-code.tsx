import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import { FieldMessage, Label } from "@hoops-genesis/ui/components/label";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useCallback, useRef } from "react";
import z from "zod";

import {
  AuthBackContent,
  AuthTitle,
  authBackClass,
  authSubmitClass,
} from "@/components/auth/auth-parts";
import {
  CODE_LENGTH,
  hasLookAlikes,
  isCompleteCode,
} from "@/features/join-codes/code-format";
import {
  AlertIcon,
  PausedClockIcon,
  ScanFrameIcon,
} from "@/features/join-codes/icons";
import { CodeInput } from "@/features/join-codes/join/code-input";
import {
  describeProblem,
  type JoinProblem,
} from "@/features/join-codes/join/problems";
import { formatTime } from "@/lib/format";

const INPUT_ID = "join-code";

const schema = z.object({
  code: z
    .string()
    .refine((code) => !(code.length === CODE_LENGTH && hasLookAlikes(code)), {
      message: "Codes never use 0, O, 1, I, L or U. Check the code.",
    })
    .refine(isCompleteCode, { message: "Enter all 12 characters." }),
});

const MS_PER_MINUTE = 60_000;

/**
 * "Too many tries" (9KQ-0). The wait is named only when the 429 said how long; the
 * host's rate limit doesn't today, so real mode says "a few minutes" and never counts.
 */
function PausedBox({ now, retryAt }: { now: Date; retryAt: Date | null }) {
  const minutes = retryAt
    ? Math.max(
        1,
        Math.round((retryAt.getTime() - now.getTime()) / MS_PER_MINUTE)
      )
    : null;
  return (
    <div
      className="flex items-start gap-[10px] rounded-md bg-orange-soft p-[14px]"
      id="join-code-problem"
      role="alert"
    >
      <PausedClockIcon className="shrink-0 text-orange-deep" />
      <p className="text-ink text-sm leading-[19px]">
        <span className="font-semibold">
          {minutes
            ? `Too many tries. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
            : "Too many tries. Wait a few minutes, then try again."}
        </span>
        <br />
        Check the code with whoever gave it to you. If you got a link, open it
        instead and the code fills in for you.
      </p>
    </div>
  );
}

/** Under the code box: the hint, a typing error, a problem, or "Too many tries". */
function CodeFeedback({
  error,
  now,
  problem,
  retryAt,
}: {
  error: string | undefined;
  now: Date | undefined;
  problem: JoinProblem | null;
  retryAt: Date | null;
}) {
  if (problem?.code === "rate_limited") {
    return (
      <>
        <p className="text-[13px] text-muted leading-[18px]">
          Code entry is paused on this account.
        </p>
        <PausedBox now={now ?? new Date()} retryAt={retryAt} />
      </>
    );
  }
  if (problem) {
    return <ProblemBox problem={problem} />;
  }
  if (error) {
    return (
      <FieldMessage id="join-code-error" tone="error">
        {error}
      </FieldMessage>
    );
  }
  return (
    <p className="text-[13px] text-muted leading-[18px]" id="join-code-hint">
      Capitals and dashes don’t matter.
      <span className="max-md:hidden"> r4kv7mxe2hqt works too.</span>
    </p>
  );
}

function ProblemBox({ problem }: { problem: JoinProblem }) {
  const { title, body } = describeProblem(problem);
  return (
    <div
      className="flex gap-[10px] rounded-md bg-orange-soft p-[14px]"
      id="join-code-problem"
      role="alert"
    >
      <AlertIcon className="shrink-0 text-orange-deep" />
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-[15px] text-ink leading-5">{title}</p>
        <p className="text-ink-soft text-sm leading-5">{body}</p>
      </div>
    </div>
  );
}

const selectSubmit = (state: {
  canSubmit: boolean;
  isSubmitting: boolean;
  values: { code: string };
}) => ({
  canSubmit: state.canSubmit,
  isSubmitting: state.isSubmitting,
  isComplete: state.values.code.length === CODE_LENGTH,
});

/**
 * "Join your academy": enter a code (Paper 6WQ-0 web, 6WS-0 phone). With `problem` it is
 * the "can't use this code" state (6WU-0), the same screen with a message instead of the
 * hint and "Try another code" (or "Open Kigali" when already a member).
 */
export function EnterCode({
  checking = false,
  initialCode,
  joinerName,
  now,
  onCheck,
  onCodeEdited,
  onRetry,
  openAcademy,
  problem,
  retryAt = null,
}: {
  checking?: boolean;
  initialCode: string;
  joinerName: string;
  /** "Now" for the "Too many tries" wait. */
  now?: Date;
  onCheck: (normalized: string) => void;
  /** The person changed the code after a problem: the parent clears it. */
  onCodeEdited?: () => void;
  /** "Try again" after "Too many tries" (rate_limited). */
  onRetry?: () => void;
  /** "Open Kigali" when the problem is "already a member". */
  openAcademy?: { label: string; to: string };
  problem: JoinProblem | null;
  /** When code entry opens again, if the 429 said (9KQ-0). */
  retryAt?: Date | null;
}) {
  const isPaused = problem?.code === "rate_limited";
  const inputRef = useRef<HTMLInputElement | null>(null);
  const form = useForm({
    defaultValues: { code: initialCode },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: ({ value }) => onCheck(value.code),
  });

  const handleCode = useCallback(
    (next: string) => {
      form.setFieldValue("code", next);
      onCodeEdited?.();
    },
    [form, onCodeEdited]
  );

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (isPaused) {
        onRetry?.();
        return;
      }
      if (problem) {
        // "Try another code": clear the box and start again.
        form.reset({ code: "" });
        onCodeEdited?.();
        inputRef.current?.focus();
        return;
      }
      form.handleSubmit();
    },
    [form, isPaused, onCodeEdited, onRetry, problem]
  );

  let action: ReactNode = (
    <form.Subscribe selector={selectSubmit}>
      {({ canSubmit, isSubmitting, isComplete }) => (
        <Button
          className={cn(
            authSubmitClass,
            "disabled:bg-[#B5B5B5] disabled:text-white"
          )}
          disabled={!(canSubmit && isComplete) || isSubmitting || checking}
          size="xl"
          type="submit"
        >
          {checking ? "Checking…" : "Check code"}
        </Button>
      )}
    </form.Subscribe>
  );
  if (isPaused) {
    action = (
      <Button
        className={cn(
          authSubmitClass,
          "disabled:bg-[#B5B5B5] disabled:text-white disabled:opacity-100"
        )}
        disabled={retryAt !== null}
        size="xl"
        type="submit"
      >
        {retryAt ? `Try again at ${formatTime(retryAt)}` : "Try again"}
      </Button>
    );
  } else if (problem?.code === "already_member" && openAcademy) {
    action = (
      <Link
        className={cn(buttonVariants({ size: "xl" }), authSubmitClass)}
        to={openAcademy.to}
      >
        {openAcademy.label}
      </Link>
    );
  } else if (problem) {
    action = (
      <Button className={authSubmitClass} size="xl" type="submit">
        Try another code
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-[22px] max-md:flex-1 max-md:gap-5"
      noValidate
      onSubmit={handleSubmit}
    >
      {/* Back to the app: /app sends people with no academy to /welcome. */}
      <Link className={authBackClass} to="/app">
        <AuthBackContent label="Back" />
      </Link>
      <div className="flex flex-col gap-2">
        <p className="font-medium text-muted text-sm uppercase leading-[18px] tracking-label max-md:hidden">
          Signed in as {joinerName}
        </p>
        <AuthTitle className="max-md:text-[52px] max-md:leading-[50px]">
          Join your academy
        </AuthTitle>
        <p className="text-base text-muted leading-[23px]">
          <span className="max-md:hidden">
            Enter the join code your coach or academy gave you. Got an invite
            link from your academy instead? Open it.
          </span>
          <span className="md:hidden">
            Type the join code you were given. You’ll check it before anything
            happens.
          </span>
        </p>
      </div>
      <form.Field name="code">
        {(field) => {
          const error =
            field.state.value.length === CODE_LENGTH
              ? (field.state.meta.errors[0] as { message?: string } | undefined)
                  ?.message
              : undefined;
          let describedBy = "join-code-hint";
          if (problem) {
            describedBy = "join-code-problem";
          } else if (error) {
            describedBy = "join-code-error";
          }
          return (
            <div className={cn("flex flex-col gap-2", problem && "gap-[10px]")}>
              <Label className="max-md:sr-only" htmlFor={INPUT_ID}>
                Join code
              </Label>
              <CodeInput
                aria-describedby={describedBy}
                disabled={isPaused}
                id={INPUT_ID}
                invalid={Boolean(problem || error) && !isPaused}
                onChange={handleCode}
                ref={inputRef}
                value={field.state.value}
              />
              <CodeFeedback
                error={error}
                now={now}
                problem={problem}
                retryAt={retryAt}
              />
            </div>
          );
        }}
      </form.Field>
      <div className="max-md:order-last max-md:mt-auto">{action}</div>
      <div
        className={cn(
          "flex flex-col gap-1 rounded-md bg-fog p-4 max-md:hidden",
          problem && "hidden"
        )}
      >
        <p className="font-semibold text-ink text-sm leading-[18px]">
          Nothing happens until you confirm
        </p>
        <p className="text-muted text-sm leading-5">
          Next you’ll see the academy, your role and your team before you join.
        </p>
      </div>
      {problem ? null : (
        <div className="flex items-center gap-[10px] rounded-md bg-fog p-[14px] md:hidden">
          <ScanFrameIcon className="shrink-0 text-ink" />
          <p className="text-ink-soft text-sm leading-[19px]">
            Got a link? Opening it fills the code in for you.
          </p>
        </div>
      )}
    </form>
  );
}
