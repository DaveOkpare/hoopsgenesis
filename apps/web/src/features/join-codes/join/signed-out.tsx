import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useCallback } from "react";
import { toast } from "sonner";
import z from "zod";

import {
  AuthBackContent,
  AuthTitle,
  authBackClass,
  authLinkClass,
  authSubmitClass,
  whiteFieldClass,
} from "@/components/auth/auth-parts";
import { FormTextField } from "@/components/form-text-field";
import {
  GrantCard,
  type PreviewExtras,
} from "@/features/join-codes/join/confirm-code";
import type { InvitationCodePreview } from "@/features/join-codes/queries";
import { authErrorMessage, errorMessage } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";

const MIN_NAME = 2;
const MIN_PASSWORD = 8;

/*
 * Step 4 of the spec ("Sign up or sign in. Only if signed out. The code from the link is
 * kept and comes back after."). Join link, signed out: Paper 9G0-0 (web), 9IM-0 (phone).
 * The create-account form has no artboard: built from the sign-in pieces (62I-0 / 62J-0).
 */

function CodeEyebrow({
  code,
  fromLink = false,
}: {
  code: string | null;
  fromLink?: boolean;
}) {
  if (!code) {
    return null;
  }
  return (
    <p className="font-medium text-muted text-sm uppercase leading-[18px] tracking-label max-md:text-[13px] max-md:leading-4">
      Code {code}
      {fromLink ? " · from your link" : null}
    </p>
  );
}

/** "You're joining Hoops Genesis Kigali as a student on U14" */
function joiningTitle(preview: InvitationCodePreview): string {
  const team = preview.team ? ` on ${preview.team.name}` : "";
  return `You’re joining ${preview.academy.name} as a ${preview.role}${team}`;
}

/**
 * Signed out on /join: make an account or sign in, keeping the code. `preview` is what
 * the code grants; real mode can't read it before sign-in (the preview route needs a
 * session), so there it is null and the page names nothing it doesn't know.
 */
export function JoinSignedOut({
  code,
  extras,
  onCreateAccount,
  preview,
}: {
  code: string | null;
  extras: PreviewExtras | null;
  onCreateAccount: () => void;
  preview: InvitationCodePreview | null;
}) {
  const loginSearch = { joinCode: code ?? "" };
  return (
    <div className="flex flex-col gap-[22px] max-md:flex-1 max-md:justify-between max-md:gap-8">
      <div className="flex flex-col gap-[22px] max-md:gap-5">
        <Link className={authBackClass} search={loginSearch} to="/login">
          <AuthBackContent label="Back to sign in" />
        </Link>
        <CodeEyebrow code={code} fromLink />
        {preview ? (
          <AuthTitle className="text-[52px] leading-[52px] max-md:text-2xl max-md:leading-10">
            {joiningTitle(preview)}
          </AuthTitle>
        ) : (
          <div className="flex flex-col gap-2">
            <AuthTitle className="max-md:text-[52px] max-md:leading-[50px]">
              Join your academy
            </AuthTitle>
            <p className="text-base text-muted leading-[23px]">
              {code
                ? "Make an account or sign in first. Then you’ll see the academy, your role and your team for this code before you join."
                : "Make an account or sign in first. Then you’ll enter the join code you were given."}
            </p>
          </div>
        )}
        {preview ? <GrantCard extras={extras} preview={preview} /> : null}
      </div>
      <div className="flex flex-col gap-[22px] max-md:gap-[10px]">
        <div className="flex flex-col gap-[10px]">
          <Button
            className={authSubmitClass}
            onClick={onCreateAccount}
            size="xl"
            variant="brand"
          >
            Create account
          </Button>
          <Link
            className={cn(
              buttonVariants({ size: "xl", variant: "outline" }),
              authSubmitClass,
              "max-md:border-0 max-md:p-3 max-md:text-base max-md:leading-5"
            )}
            search={loginSearch}
            to="/login"
          >
            I have an account. Sign in
          </Link>
        </div>
        <p className="text-[13px] text-muted leading-[18px] max-md:text-center">
          {code ? "We keep your code while you sign up. " : null}
          You confirm once more after
          <span className="max-md:hidden">
            , and nothing happens until then
          </span>
          .
        </p>
      </div>
    </div>
  );
}

const schema = z.object({
  name: z.string().trim().min(MIN_NAME, "Enter your full name"),
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(MIN_PASSWORD, "Password must be at least 8 characters"),
});

const selectSubmitState = (state: {
  canSubmit: boolean;
  isSubmitting: boolean;
}) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting });

/** Better Auth email sign-up for someone joining with a code (no invite email to lock). */
export function JoinSignUpForm({
  code,
  onSignedUp,
}: {
  code: string | null;
  onSignedUp: () => Promise<void>;
}) {
  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      try {
        await authClient.signUp.email(
          { ...value, name: value.name.trim() },
          {
            onSuccess: onSignedUp,
            onError: (error) => {
              toast.error(authErrorMessage(error.error));
            },
          }
        );
      } catch (error) {
        // fetch() itself failed (offline): Better Auth rejects instead of onError.
        toast.error(
          errorMessage(error, "Couldn't create your account. Try again.")
        );
      }
    },
  });
  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      event.stopPropagation();
      form.handleSubmit();
    },
    [form]
  );
  return (
    <form
      className="flex flex-col gap-5 max-md:flex-1 max-md:gap-[18px]"
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-2">
        <CodeEyebrow code={code} />
        <AuthTitle className="max-md:text-[52px] max-md:leading-[50px]">
          Create your account
        </AuthTitle>
      </div>
      <form.Field name="name">
        {(field) => (
          <FormTextField
            autoComplete="name"
            className={whiteFieldClass}
            field={field}
            label="Full name"
            size="lg"
          />
        )}
      </form.Field>
      <form.Field name="email">
        {(field) => (
          <FormTextField
            autoComplete="email"
            className={whiteFieldClass}
            field={field}
            inputMode="email"
            label="Email"
            size="lg"
            type="email"
          />
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <FormTextField
            autoComplete="new-password"
            className={whiteFieldClass}
            field={field}
            label="Password"
            placeholder="At least 8 characters"
            size="lg"
            type="password"
          />
        )}
      </form.Field>
      <div className="flex flex-col gap-5 max-md:mt-auto max-md:gap-[14px]">
        <form.Subscribe selector={selectSubmitState}>
          {({ canSubmit, isSubmitting }) => (
            <Button
              className={authSubmitClass}
              disabled={!canSubmit || isSubmitting}
              size="xl"
              type="submit"
            >
              {isSubmitting ? "Creating account…" : "Create account"}
            </Button>
          )}
        </form.Subscribe>
        <p className="text-muted text-sm leading-5 max-md:text-center">
          Have an account?{" "}
          <Link
            className={authLinkClass}
            search={{ joinCode: code ?? "" }}
            to="/login"
          >
            Sign in
          </Link>
        </p>
      </div>
    </form>
  );
}
