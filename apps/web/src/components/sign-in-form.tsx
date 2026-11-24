import { Button } from "@hoops-genesis/ui/components/button";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import {
  AuthTitle,
  authLinkClass,
  authSubmitClass,
  EyeIcon,
  EyeOffIcon,
  fogFieldClass,
} from "@/components/auth/auth-parts";
import { BrandMark } from "@/components/brand-mark";
import { FormTextField } from "@/components/form-text-field";
import { useAcceptInvitation } from "@/features/invitations/queries";
import { authErrorMessage, errorMessage } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";

const MIN_PASSWORD = 8;
const WRONG_CREDENTIALS = 401;

const schema = z.object({
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(MIN_PASSWORD, "Password must be at least 8 characters"),
});

const selectSubmitState = (state: {
  canSubmit: boolean;
  isSubmitting: boolean;
}) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting });

/**
 * Better Auth email sign-in, styled to Paper 62I-0 (web) / 62K-0 (390).
 * With `invitationId` (from "Sign in to accept" on an invite), the invite is accepted
 * after sign-in and the person lands on "You're in"; otherwise they go to /app.
 */
export default function SignInForm({
  invitationId,
  joinCode,
  redirect,
}: {
  invitationId?: string;
  /** From /join when signed out: go back there after sign-in ("" = /join). */
  joinCode?: string;
  /** A same-site path to return to (the session ended mid-visit). */
  redirect?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const acceptInvitation = useAcceptInvitation();
  const [showPassword, setShowPassword] = useState(false);

  const finishSignIn = useCallback(async () => {
    // Anything cached belonged to whoever was signed in before.
    queryClient.removeQueries();
    if (joinCode !== undefined) {
      await (joinCode
        ? navigate({ to: "/join/$code", params: { code: joinCode } })
        : navigate({ to: "/join" }));
      return;
    }
    if (!invitationId) {
      // Back to the page the person was on when their session ended, if any.
      await (redirect
        ? navigate({ href: redirect })
        : navigate({ to: "/app" }));
      return;
    }
    try {
      await acceptInvitation.mutateAsync({ invitationId });
      await navigate({
        to: "/invite/$invitationId",
        params: { invitationId },
        search: { state: "joined" },
        replace: true,
      });
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't accept the invite."));
      await navigate({ to: "/app" });
    }
  }, [
    acceptInvitation,
    invitationId,
    joinCode,
    navigate,
    queryClient,
    redirect,
  ]);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      try {
        await authClient.signIn.email(value, {
          onSuccess: finishSignIn,
          onError: (error) => {
            // 401 here is a wrong email or password, not an ended session.
            toast.error(
              error.error.status === WRONG_CREDENTIALS
                ? "That email and password don't match. Try again."
                : authErrorMessage(error.error)
            );
          },
        });
      } catch (error) {
        // fetch() itself failed (offline): Better Auth rejects instead of onError.
        toast.error(errorMessage(error, "Couldn't sign in. Try again."));
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

  const togglePassword = useCallback(() => setShowPassword((v) => !v), []);

  return (
    <form
      className="flex flex-col gap-[22px] max-md:flex-1 max-md:justify-between"
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-[22px]">
        <BrandMark
          className="rounded-md text-xl leading-7 md:hidden"
          size={56}
        />
        <div className="flex flex-col gap-2">
          <AuthTitle className="max-md:text-[60px] max-md:leading-[56px]">
            <span className="max-md:hidden">Sign in</span>
            <span className="md:hidden">
              Show up.
              <br />
              Sign in.
            </span>
          </AuthTitle>
          <p className="text-base text-muted leading-[22px]">
            <span className="max-md:hidden">Welcome back. </span>
            Use the email your academy invited.
          </p>
        </div>
        <form.Field name="email">
          {(field) => (
            <FormTextField
              autoComplete="email"
              className={fogFieldClass}
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
              autoComplete="current-password"
              className={fogFieldClass}
              field={field}
              label="Password"
              labelAction={
                <Link
                  aria-label="Forgot password?"
                  className={`${authLinkClass} font-medium text-sm leading-[18px]`}
                  to="/forgot-password"
                >
                  <span className="max-md:hidden">Forgot password?</span>
                  <span className="md:hidden">Forgot?</span>
                </Link>
              }
              size="lg"
              trailing={
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="-m-2 flex size-[34px] cursor-pointer items-center justify-center rounded-full text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ink max-md:hidden"
                  onClick={togglePassword}
                  type="button"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              }
              type={showPassword ? "text" : "password"}
            />
          )}
        </form.Field>
      </div>
      <div className="flex flex-col gap-[22px] max-md:gap-[14px]">
        <form.Subscribe selector={selectSubmitState}>
          {({ canSubmit, isSubmitting }) => (
            <Button
              className={authSubmitClass}
              disabled={!canSubmit || isSubmitting}
              size="xl"
              type="submit"
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          )}
        </form.Subscribe>
        <div className="flex flex-col gap-1 rounded-md bg-fog p-4 max-md:hidden">
          <p className="font-semibold text-ink text-sm leading-[18px]">
            New here?
          </p>
          <p className="text-muted text-sm leading-5">
            Accounts come from an email invite or a join code from your academy.
            Got a code?{" "}
            <Link
              className={authLinkClass}
              search={{ account: "new" }}
              to="/join"
            >
              Create an account
            </Link>
          </p>
        </div>
        <p className="text-center text-muted text-sm leading-5 md:hidden">
          No account? Open your invite email, or{" "}
          <Link className={authLinkClass} to="/join">
            use a join code
          </Link>
        </p>
      </div>
    </form>
  );
}
