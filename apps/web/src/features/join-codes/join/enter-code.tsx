import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import { FieldMessage, Label } from "@hoops-genesis/ui/components/label";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useCallback, useRef } from "react";
import z from "zod";

import { AuthTitle, authSubmitClass } from "@/components/auth/auth-parts";
import { BrandMark } from "@/components/brand-mark";
import {
  CODE_LENGTH,
  hasLookAlikes,
  isCompleteCode,
} from "@/features/join-codes/code-format";
import { AlertIcon, ScanFrameIcon } from "@/features/join-codes/icons";
import { CodeInput } from "@/features/join-codes/join/code-input";
import {
  describeProblem,
  type JoinProblem,
} from "@/features/join-codes/join/problems";

const INPUT_ID = "join-code";

const schema = z.object({
  code: z
    .string()
    .refine((code) => !(code.length === CODE_LENGTH && hasLookAlikes(code)), {
      message: "Codes never use 0, O, 1, I, L or U. Check the code.",
    })
    .refine(isCompleteCode, { message: "Enter all 12 characters." }),
});

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
  onCheck,
  onCodeEdited,
  openAcademy,
  problem,
}: {
  checking?: boolean;
  initialCode: string;
  joinerName: string;
  onCheck: (normalized: string) => void;
  /** The person changed the code after a problem: the parent clears it. */
  onCodeEdited?: () => void;
  /** "Open Kigali" when the problem is "already a member". */
  openAcademy?: { label: string; to: string };
  problem: JoinProblem | null;
}) {
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
      if (problem) {
        // "Try another code": clear the box and start again.
        form.reset({ code: "" });
        onCodeEdited?.();
        inputRef.current?.focus();
        return;
      }
      form.handleSubmit();
    },
    [form, onCodeEdited, problem]
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
  if (problem?.code === "already_member" && openAcademy) {
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
      <BrandMark className="rounded-md text-xl leading-7 md:hidden" size={56} />
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
            email instead? Open the link in it.
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
                id={INPUT_ID}
                invalid={Boolean(problem || error)}
                onChange={handleCode}
                ref={inputRef}
                value={field.state.value}
              />
              {problem ? <ProblemBox problem={problem} /> : null}
              {!problem && error ? (
                <FieldMessage id="join-code-error" tone="error">
                  {error}
                </FieldMessage>
              ) : null}
              {problem || error ? null : (
                <p
                  className="text-[13px] text-muted leading-[18px]"
                  id="join-code-hint"
                >
                  Capitals and dashes don’t matter.
                  <span className="max-md:hidden">
                    {" "}
                    r4kv7mxe2hqt works too.
                  </span>
                </p>
              )}
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
