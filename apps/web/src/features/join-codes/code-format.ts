/*
 * Join code text rules (Paper "[Spec] Join with a code", 67S-0, "Code rules"):
 * 12 characters shown as K7PM-4QXR-9TWC, no look-alikes. People may type any case,
 * with or without dashes or spaces, or paste the whole link. Mirrors the server's
 * `invitation-code-format.ts` (alphabet, length, grouping).
 */

export const CODE_LENGTH = 12;
const GROUP = 4;

/** Letters and digits a code can contain: no 0, O, 1, I, L or U (server alphabet). */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

const NOT_ALPHANUMERIC = /[^A-Z0-9]/g;
const LOOK_ALIKES = /[01OILU]/;
const LINK_CODE = /(?:\/join\/|[?&]code=)([^/?#&\s]+)/i;
const VALID_CODE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** "app.hoopsgenesis.com/join/r4kv-7mxe-2hqt" or " r4kv 7mxe 2hqt " -> "R4KV7MXE2HQT". */
export function normalizeCode(raw: string): string {
  const fromLink = LINK_CODE.exec(raw)?.[1];
  const source = fromLink ? decodeURIComponent(fromLink) : raw;
  return source
    .toUpperCase()
    .replace(NOT_ALPHANUMERIC, "")
    .slice(0, CODE_LENGTH);
}

/** "R4KV7MXE2H" -> "R4KV-7MXE-2H" (dashes only between groups that have started). */
export function formatCode(normalized: string): string {
  const groups: string[] = [];
  for (let index = 0; index < normalized.length; index += GROUP) {
    groups.push(normalized.slice(index, index + GROUP));
  }
  return groups.join("-");
}

/** The grey "____" left to type after what has been typed: "R4KV-7MXE-" + "____". */
export function remainingMask(normalized: string): string {
  const template = formatCode("_".repeat(CODE_LENGTH));
  return template.slice(formatCode(normalized).length);
}

/** Caret index in the formatted text after `count` code characters. */
export function caretForCount(count: number): number {
  if (count <= 0) {
    return 0;
  }
  return count + Math.floor((count - 1) / GROUP);
}

export function hasLookAlikes(normalized: string): boolean {
  return LOOK_ALIKES.test(normalized);
}

export function isCompleteCode(normalized: string): boolean {
  return VALID_CODE.test(normalized);
}

/** "R4KV-7MXE-2HQT" from anything a person might type or paste. */
export function displayCode(raw: string): string {
  return formatCode(normalizeCode(raw));
}
