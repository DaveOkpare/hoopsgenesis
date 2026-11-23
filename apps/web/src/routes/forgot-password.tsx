import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import {
  AuthIconDisc,
  AuthTitle,
  authLinkClass,
  authSubmitClass,
  ChevronLeftIcon,
  fogFieldClass,
  MailIcon,
} from "@/components/auth/auth-parts";
import { AuthLayout } from "@/components/auth-layout";
import { FormTextField } from "@/components/form-text-field";
import { authClient } from "@/lib/auth-client";
import { isUiPreview } from "@/lib/preview";

/** Where the emailed link lands to set a new password (page not built yet). */
const RESET_REDIRECT_PATH = "/reset-password";
const PREVIEW_EMAIL = "aline.u@example.com";
const TOO_MANY_REQUESTS = 429;

/** `preview=sent` shows the "Check your email" state in UI preview mode (dev only). */
const searchSchema = z.object({
  preview: z.enum(["sent"]).optional().catch(undefined),
});

export const Route = createFileRoute("/forgot-password")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Reset password · Hoops Genesis" }] }),
  component: ForgotPasswordPage,
});

const schema = z.object({ email: z.email("Enter a valid email address") });

/**
 * Ask Better Auth to email a reset link. The response is the same whether or not the
 * email has an account, and so is what we show, so the page never reveals who exists.
 */
async function requestReset(email: string): Promise<boolean> {
  const { error } = await authClient.requestPasswordReset({
    email,
    redirectTo: RESET_REDIRECT_PATH,
  });
  if (!error) {
    return true;
  }
  toast.error(
    error.status === TOO_MANY_REQUESTS
      ? "Too many tries. Wait a minute and try again."
      : "Couldn't send the link right now. Try again in a few minutes."
  );
  return false;
}

/*
 * Reset password. Request step: no artboard, same language as sign in (62I-0 / 62K-0).
 * Sent step: "Check your email" (62M-0).
 */
function ForgotPasswordPage() {
  const { preview } = Route.useSearch();
  const [sentTo, setSentTo] = useState<string | null>(
    isUiPreview && preview === "sent" ? PREVIEW_EMAIL : null
  );
  const clearSent = useCallback(() => setSentTo(null), []);

  return (
    <AuthLayout>
      {sentTo ? (
        <EmailSent email={sentTo} onBack={clearSent} />
      ) : (
        <RequestForm onSent={setSentTo} />
      )}
    </AuthLayout>
  );
}

const selectSubmitState = (state: {
  canSubmit: boolean;
  isSubmitting: boolean;
}) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting });

const backButtonClass =
  "flex size-9 shrink-0 items-center justify-center rounded-full bg-fog text-ink outline-none hover:bg-stone/60 focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2";

function RequestForm({ onSent }: { onSent: (email: string) => void }) {
  const form = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      const email = value.email.trim();
      if (await requestReset(email)) {
        onSent(email);
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
      className="flex flex-col gap-[22px] max-md:flex-1 max-md:justify-between"
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-[22px]">
        <Link
          aria-label="Back to sign in"
          className={backButtonClass}
          to="/login"
        >
          <ChevronLeftIcon />
        </Link>
        <div className="flex flex-col gap-2">
          <AuthTitle>Reset password</AuthTitle>
          <p className="text-base text-muted leading-[22px]">
            Enter the email your academy invited. We'll send a link to set a new
            password.
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
              {isSubmitting ? "Sending…" : "Send reset link"}
            </Button>
          )}
        </form.Subscribe>
        <p className="text-muted text-sm leading-5 max-md:text-center">
          Remembered it?{" "}
          <Link className={authLinkClass} to="/login">
            Sign in
          </Link>
        </p>
      </div>
    </form>
  );
}

function EmailSent({ email, onBack }: { email: string; onBack: () => void }) {
  const [isResending, setIsResending] = useState(false);

  const handleResend = useCallback(async () => {
    setIsResending(true);
    if (await requestReset(email)) {
      toast.success("Sent again. Check your inbox and spam folder.");
    }
    setIsResending(false);
  }, [email]);

  return (
    <div className="flex flex-col gap-[22px] max-md:flex-1 max-md:justify-between">
      <div className="flex flex-col gap-[22px]">
        <button
          aria-label="Back"
          className={cn(backButtonClass, "cursor-pointer")}
          onClick={onBack}
          type="button"
        >
          <ChevronLeftIcon />
        </button>
        <AuthIconDisc>
          <MailIcon />
        </AuthIconDisc>
        <AuthTitle>Check your email</AuthTitle>
        <p className="text-[17px] text-ink-soft leading-[25px]" role="status">
          If <span className="font-semibold text-ink">{email}</span> has an
          account, a link to set a new password is on its way. It works for 1
          hour.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <a
          className={cn(buttonVariants({ size: "xl" }), authSubmitClass)}
          href="mailto:"
        >
          Open email app
        </a>
        <p className="text-center text-muted text-sm leading-5">
          Nothing after a few minutes?{" "}
          <button
            className={cn(authLinkClass, "cursor-pointer disabled:opacity-50")}
            disabled={isResending}
            onClick={handleResend}
            type="button"
          >
            {isResending ? "Sending…" : "Send again"}
          </button>
        </p>
      </div>
    </div>
  );
}
