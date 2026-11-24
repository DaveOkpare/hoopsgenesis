import { Button } from "@hoops-genesis/ui/components/button";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
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
import {
  CODE_LENGTH,
  formatCode,
  hasLookAlikes,
  isCompleteCode,
  normalizeCode,
} from "@/features/join-codes/code-format";
import { useSignOut } from "@/features/viewer/queries";
import { errorMessage } from "@/lib/api-client";

const schema = z.object({
  code: z
    .string()
    .transform(normalizeCode)
    .refine((code) => !(code.length === CODE_LENGTH && hasLookAlikes(code)), {
      message: "Codes never use 0, O, 1, I, L or U. Check the code.",
    })
    .refine(isCompleteCode, { message: "Enter all 12 letters and numbers." }),
});

/**
 * Signed in, no academy yet (Paper 89U-0 web, 8B0-0 phone): everyone with no
 * membership lands here from /app. "Continue" checks the code on /join/<code>, where
 * nothing happens until they confirm. Sign out is on the web card; the phone artboard
 * has none, so it sits under the footnote there too (nobody should be stuck here).
 */
export function WelcomeScreen({ email }: { email: string }) {
  const navigate = useNavigate();
  const signOut = useSignOut();

  const form = useForm({
    defaultValues: { code: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      await navigate({
        to: "/join/$code",
        params: { code: formatCode(normalizeCode(value.code)) },
      });
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

  const handleSignOut = useCallback(async () => {
    try {
      await signOut.mutateAsync();
    } catch (error) {
      toast.error(errorMessage(error, "Couldn’t sign out. Try again."));
      return;
    }
    await navigate({ to: "/login" });
  }, [navigate, signOut]);

  const signOutLink = (
    <button
      className={cn(authLinkClass, "cursor-pointer disabled:opacity-50")}
      disabled={signOut.isPending}
      onClick={handleSignOut}
      type="button"
    >
      {signOut.isPending ? "Signing out…" : "Sign out"}
    </button>
  );

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
            No academy yet
          </AuthTitle>
          <p className="text-base text-muted leading-[22px]">
            <span className="max-md:hidden">You're signed in as </span>
            <span className="md:hidden">Signed in as </span>
            {email}. Join your academy to see your team, sessions and fees.
          </p>
        </div>
        <form.Field name="code">
          {(field) => (
            <FormTextField
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              className={cn(
                whiteFieldClass,
                "font-mono text-lg uppercase leading-[22px] tracking-[0.06em] placeholder:text-[#A3A3A3] placeholder:normal-case"
              )}
              description={
                <>
                  12 letters and numbers
                  <span className="max-md:hidden"> from your academy</span>.
                  Capitals and dashes don't matter.
                </>
              }
              descriptionClassName="text-[13px] leading-[18px]"
              enterKeyHint="go"
              field={field}
              label="Join code"
              placeholder="XXXX-XXXX-XXXX"
              size="lg"
              spellCheck={false}
            />
          )}
        </form.Field>
      </div>
      <div className="flex flex-col gap-[22px] max-md:gap-[14px]">
        <Button className={authSubmitClass} size="xl" type="submit">
          Continue
        </Button>
        <div className="flex flex-col gap-1 rounded-md bg-fog p-4 max-md:hidden">
          <p className="font-semibold text-ink text-sm leading-[18px]">
            Got an invite email instead?
          </p>
          <p className="text-muted text-sm leading-5">
            Open it and tap the link. It adds you to the academy. No email and
            no code? Ask your coach or academy admin for one. {signOutLink}
          </p>
        </div>
        <p className="text-center text-muted text-sm leading-5 md:hidden">
          Got an invite email? Open it and tap the link.
          <br />
          No code? Ask your coach or academy admin.
          <br />
          {signOutLink}
        </p>
      </div>
    </form>
  );
}
