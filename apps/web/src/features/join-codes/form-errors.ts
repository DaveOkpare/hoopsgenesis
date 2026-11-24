/*
 * Puts a failed POST /invitation-codes on the right field of "New join code". The
 * server names its fields `maxUses` and `expiresAt` (in `details.issues[].path`, or as
 * `expires_at_in_past` / `lifetime_too_long`); the form splits them over "uses"/"upTo"
 * and "expiry"/"date". Its messages are written for developers, so ours replace them.
 */
import { ApiError, apiFieldErrors } from "@/lib/api-client";

export type CodeFormField = "date" | "expiry" | "upTo" | "uses";

const EXPIRY_MESSAGES: Record<string, string> = {
  expires_at_in_past: "Pick a day after today.",
  lifetime_too_long: "Pick a day up to 90 days away.",
};
const EXPIRY_FALLBACK = "Pick a day up to 90 days away.";
const USES_MESSAGE = "Enter a number from 1 to 1000.";

export function codeFormServerErrors(
  error: unknown,
  values: { expiry: string; uses: string }
): Partial<Record<CodeFormField, string>> {
  if (!(error instanceof ApiError)) {
    return {};
  }
  const out: Partial<Record<CodeFormField, string>> = {};
  const fields = apiFieldErrors(error);
  const expiryField: CodeFormField =
    values.expiry === "date" ? "date" : "expiry";
  if (error.code in EXPIRY_MESSAGES) {
    out[expiryField] = EXPIRY_MESSAGES[error.code];
  } else if ("expiresAt" in fields) {
    out[expiryField] = EXPIRY_FALLBACK;
  }
  if ("maxUses" in fields) {
    out[values.uses === "upTo" ? "upTo" : "uses"] = USES_MESSAGE;
  }
  return out;
}
