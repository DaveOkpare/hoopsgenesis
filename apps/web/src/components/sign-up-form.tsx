import { Button } from "@hoops-genesis/ui/components/button";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
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
import { viewerKeys } from "@/features/viewer/queries";
import { authErrorMessage, errorMessage } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { isUiPreview } from "@/lib/preview";

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
 * 62L-0 (390). When the invitation could be read, its email is given and is read-only;
 * otherwise (signed-out visitors can't read an invitation) the person types it. After
 * the account is created (Better Auth signs the person in), `onSignedUp` accepts the
 * invitation.
 */
export default function SignUpForm({
  email,
  header,
  invitationId,
  onSignedUp,
}: {
  /** The invited email, locked. Omit to let the person type it. */
  email?: string;
  /** Invite banner and title, shown above the fields. */
  header: ReactNode;
  invitationId: string;
  onSignedUp: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const form = useForm({
    defaultValues: { name: "", email: email ?? "", password: "" },
    onSubmit: async ({ value }) => {
      try {
        await authClient.signUp.email(
          {
            ...value,
            name: value.name.trim(),
            email: email ?? value.email.trim(),
          },
          {
            onSuccess: async () => {
              // A new session: drop whatever was cached for the previous one.
              if (!isUiPreview) {
                queryClient.removeQueries({ queryKey: viewerKeys.all });
              }
              await onSignedUp();
            },
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
          {(field) =>
            email ? (
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
            ) : (
              <FormTextField
                autoComplete="email"
                className={whiteFieldClass}
                description="Use the email address the invite is for."
                descriptionClassName="max-md:hidden"
                field={field}
                inputMode="email"
                label="Email"
                size="lg"
                type="email"
              />
            )
          }
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
