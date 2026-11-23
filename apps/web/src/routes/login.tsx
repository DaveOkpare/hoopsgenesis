import { createFileRoute } from "@tanstack/react-router";
import z from "zod";

import { AuthLayout } from "@/components/auth-layout";
import SignInForm from "@/components/sign-in-form";

const JOIN_CODE_PARAM = /^[A-Za-z0-9-]{0,14}$/;

/**
 * `invitationId`: set by "Sign in to accept" on an invite; accepted after sign-in.
 * `joinCode`: set by /join when signed out; sign-in goes back to /join/<code> ("" = /join).
 */
const searchSchema = z.object({
  invitationId: z.string().min(1).optional().catch(undefined),
  joinCode: z.string().regex(JOIN_CODE_PARAM).optional().catch(undefined),
});

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Sign in · Hoops Genesis" }] }),
  component: LoginPage,
});

/*
 * Sign in (Paper 62I-0 web / 62K-0 390). On success it goes to /app, which redirects to
 * the role's home. There is no public sign-up: accounts come from invites.
 */
function LoginPage() {
  const { invitationId, joinCode } = Route.useSearch();
  return (
    <AuthLayout>
      <SignInForm invitationId={invitationId} joinCode={joinCode} />
    </AuthLayout>
  );
}
