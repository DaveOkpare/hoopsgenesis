import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useCallback } from "react";
import { toast } from "sonner";
import z from "zod";

import {
  AuthTitle,
  authLinkClass,
  authSubmitClass,
  whiteFieldClass,
} from "@/components/auth/auth-parts";
import { BrandMark } from "@/components/brand-mark";
import { FormTextField } from "@/components/form-text-field";
import { authClient } from "@/lib/auth-client";

const MIN_NAME = 2;
const MIN_PASSWORD = 8;

/*
 * Step 4 of the spec ("Sign up or sign in. Only if signed out. The code from the link is
 * kept and comes back after."). No artboard: built from the sign-in pieces (62I-0 / 62J-0).
 */

function CodeEyebrow({ code }: { code: string | null }) {
  if (!code) {
    return null;
  }
  return (
    <p className="font-medium text-muted text-sm uppercase leading-[18px] tracking-label max-md:text-[13px] max-md:leading-4">
      Code {code}
    </p>
  );
}

/** Signed out on /join: make an account or sign in, keeping the code. */
export function JoinSignedOut({
  code,
  onCreateAccount,
}: {
  code: string | null;
  onCreateAccount: () => void;
}) {
  return (
    <div className="flex flex-col gap-[22px] max-md:flex-1 max-md:gap-5">
      <BrandMark className="rounded-md text-xl leading-7 md:hidden" size={56} />
      <div className="flex flex-col gap-2">
        <CodeEyebrow code={code} />
        <AuthTitle className="max-md:text-[52px] max-md:leading-[50px]">
          Join your academy
        </AuthTitle>
        <p className="text-base text-muted leading-[23px]">
          First make an account, or sign in if you have one.
          {code ? " Your code is kept and comes back after." : null}
        </p>
      </div>
      <div className="flex flex-col gap-3 max-md:mt-auto">
        <Button className={authSubmitClass} onClick={onCreateAccount} size="xl">
          Create an account
        </Button>
        <Link
          className={cn(
            buttonVariants({ size: "xl", variant: "outline" }),
            authSubmitClass
          )}
          search={{ joinCode: code ?? "" }}
          to="/login"
        >
          I already have an account
        </Link>
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
      await authClient.signUp.email(
        { ...value, name: value.name.trim() },
        {
          onSuccess: onSignedUp,
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        }
      );
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
