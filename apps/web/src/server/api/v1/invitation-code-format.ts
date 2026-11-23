/**
 * The invitation code itself: generation, the forms people type, and links.
 *
 * 12 characters from a 30-character alphabet with no look-alikes (no 0, O, 1,
 * I, L or U): 30^12 = 5.3e17 codes, about 58.9 bits of entropy, drawn with
 * `crypto.randomInt` (uniform, no modulo bias). Stored without dashes and
 * shown as `XXXX-XXXX-XXXX`. Input is accepted in any case, with or without
 * dashes and spaces.
 *
 * Links: `<BETTER_AUTH_URL>/join/<code>` (web) and
 * `hoops-genesis://join?code=<code>` (the native app's scheme,
 * apps/native/app.json). Codes and links are never logged or written to
 * audit_log; audit rows carry `secretFingerprint(code)` (../audit.ts).
 */
import { randomInt } from "node:crypto";

import { ENV } from "../../../env.server";

export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 12;
const GROUP_SIZE = 4;
const JOIN_DEEP_LINK_BASE = "hoops-genesis://join";
const WEB_JOIN_PATH = "/join/";
const TRAILING_SLASHES = /\/+$/;
const SEPARATORS = /[\s-]+/g;
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
const GROUPS = new RegExp(`.{1,${GROUP_SIZE}}`, "g");

/** A new random code, in its stored form (12 characters, no dashes). */
export const generateInvitationCode = (): string => {
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
};

/**
 * The stored form of what someone typed or scanned, or null if it cannot be
 * a code: upper-cased, dashes and spaces removed.
 */
export const normalizeInvitationCode = (input: string): string | null => {
  const code = input.replace(SEPARATORS, "").toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
};

/** `XXXX-XXXX-XXXX`. */
export const formatInvitationCode = (code: string): string =>
  (code.match(GROUPS) ?? []).join("-");

export interface InvitationCodeLinks {
  /** Opens the native app's join screen. */
  deepLink: string;
  /** The web join page; what an admin pastes into WhatsApp or SMS. */
  link: string;
}

/** Both links for a stored code. The host comes from BETTER_AUTH_URL. */
export const invitationCodeLinks = (code: string): InvitationCodeLinks => {
  const base = ENV.BETTER_AUTH_URL.replace(TRAILING_SLASHES, "");
  const value = encodeURIComponent(formatInvitationCode(code));
  return {
    link: `${base}${WEB_JOIN_PATH}${value}`,
    deepLink: `${JOIN_DEEP_LINK_BASE}?code=${value}`,
  };
};
