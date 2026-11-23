/*
 * What the person sees when a code can't be used. Copy from the spec artboard
 * ("[Spec] Join with a code", 67S-0, "Check fails") and 6WU-0 (used up). The server's
 * 410 errors carry nothing about the academy, so "Expired" can't name the day it
 * stopped working.
 */
import type { InvitationCodeErrorCode } from "@/features/join-codes/queries";

export type JoinProblemCode = InvitationCodeErrorCode | "unknown";

export interface JoinProblem {
  /** Set for "already a member": the academy to open. */
  academyName?: string;
  code: JoinProblemCode;
}

export function describeProblem(problem: JoinProblem): {
  body: string;
  title: string;
} {
  switch (problem.code) {
    case "invalid_code":
    case "invitation_code_not_found":
      return {
        title: "We can’t find that code",
        body: "Check it with whoever gave it to you.",
      };
    case "code_revoked":
      return {
        title: "This code was turned off",
        body: "The academy turned it off. Ask for a new one.",
      };
    case "code_expired":
      return {
        title: "This code has stopped working",
        body: "It has expired. Ask whoever gave it to you for a new one.",
      };
    case "code_used_up":
      return {
        title: "This code is used up",
        body: "Everyone it was made for has joined. Ask whoever gave it to you for a new code.",
      };
    case "already_member":
      return {
        title: `You’re already in ${problem.academyName ?? "this academy"}`,
        body: "Nothing was used up.",
      };
    case "already_redeemed":
      return {
        title: "You’ve already used this code",
        body: "Each person can use a code once. Ask for a new one.",
      };
    case "one_team_per_student":
      return {
        title: "You’re already on a team here",
        body: "Ask an admin to move you.",
      };
    case "platform_admin_cannot_be_member":
      return {
        title: "The owner can’t join an academy",
        body: "You already see every academy from the owner pages.",
      };
    case "rate_limited":
      return {
        title: "Too many tries",
        body: "Code entry is paused for a while. Wait a few minutes, then try again.",
      };
    default:
      return {
        title: "Something went wrong",
        body: "Check your connection and try again.",
      };
  }
}
