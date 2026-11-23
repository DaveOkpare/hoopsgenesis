/* Display helpers for the Teams list and Create team. */
import type { TeamListItem } from "@/features/teams/queries";

const WHITESPACE = /\s+/;
const EMAIL_NAME_SEPARATOR = /[._-]+/;

/** "Patrick Habimana" -> "Patrick H."; "Sharika D." stays as it is. */
export function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(WHITESPACE);
  const last = rest.at(-1);
  if (!(first && last) || last.endsWith(".")) {
    return name;
  }
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Name for someone known only by an invite email: "sarah.k@example.com" -> "Sarah K.". */
export function nameFromEmail(email: string): string {
  const [local = email] = email.split("@");
  const [first, ...rest] = local.split(EMAIL_NAME_SEPARATOR).filter(Boolean);
  if (!first) {
    return email;
  }
  const last = rest.at(-1);
  return last
    ? `${capitalise(first)} ${last.charAt(0).toUpperCase()}.`
    : capitalise(first);
}

/** "Coach: Sharika D." / "Coaches: Patrick H., Sharika D." */
export function coachLine(item: TeamListItem): string | null {
  if (item.coaches.length === 0) {
    return null;
  }
  const names = item.coaches.map((c) => shortName(c.name)).join(", ");
  return `${item.coaches.length === 1 ? "Coach" : "Coaches"}: ${names}`;
}

/** "No coach yet · Sarah K.’s invite expired" */
export function noCoachLine(item: TeamListItem): string {
  const invite = item.coachInvite;
  if (!invite) {
    return "No coach yet";
  }
  const who = nameFromEmail(invite.email);
  return invite.status === "expired"
    ? `No coach yet · ${who}’s invite expired`
    : `No coach yet · ${who} is invited`;
}

/** "Eric Niyonzima" / "Eric Niyonzima and Aline Uwase" / "A, B and C" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
