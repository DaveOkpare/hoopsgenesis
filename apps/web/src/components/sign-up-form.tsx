import { Button } from "@hoops-genesis/ui/components/button";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useCallback } from "react";
import { toast } from "sonner";
import z from "zod";

import {
  authLinkClass,
  authSubmitClass,
  LockIcon,
  lockedFieldClass,
  whiteFieldClass,
} from "@/components/auth/auth-parts";
import { FormTextField } from "@/components/form-text-field";
import { authClient } from "@/lib/auth-client";

const MIN_NAME = 2;
const MIN_PASSWORD = 8;

const schema = z.object({
  name: z.string().trim().min(MIN_NAME, "Enter your full name"),
  email: z.email("Invalid email address"),
  password: z
    .string()
    .min(MIN_PASSWORD, "Password must be at least 8 characters"),
});

const selectSubmitState = (state: {
  canSubmit: boolean;
  isSubmitting: boolean;
}) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting });

/**
 * Better Auth email sign-up for an invited person, styled to Paper 62J-0 (web) /
 * 62L-0 (390). The email comes from the invitation and is read-only. After the account
 * is created (Better Auth signs the person in), `onSignedUp` accepts the invitation.
 */
export default function SignUpForm({
  email,
  header,
  invitationId,
  onSignedUp,
}: {
  email: string;
  /** Invite banner and title, shown above the fields. */
  header: ReactNode;
  invitationId: string;
  onSignedUp: () => Promise<void>;
}) {
  const form = useForm({
    defaultValues: { name: "", email, password: "" },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email(
        { ...value, name: value.name.trim(), email },
        {
          onSuccess: onSignedUp,
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        }
      );
    },
    validators: { onSubmit: schema },
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
      className="flex flex-col gap-5 max-md:flex-1 max-md:justify-between max-md:gap-[18px]"
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-5 max-md:gap-[18px]">
        {header}
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
              className={lockedFieldClass}
              description="Set by your invite, so it can't be changed here."
              descriptionClassName="max-md:hidden"
              field={field}
              label="Email"
              readOnly
              size="lg"
              trailing={<LockIcon className="text-muted max-md:hidden" />}
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
      </div>
      <div className="flex flex-col gap-5 max-md:gap-[14px]">
        <form.Subscribe selector={selectSubmitState}>
          {({ canSubmit, isSubmitting }) => (
            <Button
              className={authSubmitClass}
              disabled={!canSubmit || isSubmitting}
              size="xl"
              type="submit"
            >
              {isSubmitting ? "Creating account…" : "Create account and join"}
            </Button>
          )}
        </form.Subscribe>
        <p className="text-muted text-sm leading-5 max-md:text-center">
          <span className="max-md:hidden">Already have an account? </span>
          <span className="md:hidden">Have an account? </span>
          <Link className={authLinkClass} search={{ invitationId }} to="/login">
            Sign in to accept
          </Link>
        </p>
      </div>
    </form>
  );
}
