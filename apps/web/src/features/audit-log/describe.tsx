/*
 * How an audit entry reads on screen: the badge ("VOID", "CHECK-OUT", …) and the
 * sentence. Every action the server writes (grep `writeAuditLog(` in
 * apps/web/src/server and the Better Auth hooks in packages/auth/src/index.ts) has one:
 *
 *   fee.create  fee.void  attendance.check_out  attendance.void  attendance.verify
 *   attendance.unverify  record.verify  record.reject  team.member_add
 *   team.member_remove  member.join_by_code  invitation_code.create
 *   invitation_code.revoke  event.delete  event.session_cancel  academy_qr.regenerate
 *   academy.admin_appoint  academy.admin_remove  academy.admin_invite
 *   academy.admin_invite_cancel  academy.create  academy.delete
 *   user.impersonate_start  user.impersonate_stop
 *
 * The desktop sentence has no subject ("Voided a payment for **Samuel Mugabo** · RWF
 * 30,000", the actor is in its own column); the phone one leads with the actor ("**You**
 * voided a payment for **Jean Mugisha**") and puts the detail on its own line.
 */
import type { ReactNode } from "react";

import type { AuditLogItem } from "@/features/audit-log/queries";
import type { Id } from "@/features/types";

const WHITESPACE = /\s+/;

export interface AuditKind {
  label: string;
  tone: "alert" | "neutral";
}

const KIND: Record<string, AuditKind> = {
  "fee.create": { label: "Payment", tone: "neutral" },
  "fee.void": { label: "Void", tone: "alert" },
  "attendance.void": { label: "Void", tone: "alert" },
  "attendance.check_out": { label: "Check-out", tone: "neutral" },
  "attendance.verify": { label: "Tick", tone: "neutral" },
  "attendance.unverify": { label: "Untick", tone: "neutral" },
  "record.verify": { label: "Verify", tone: "neutral" },
  "record.reject": { label: "Reject", tone: "alert" },
  "team.member_add": { label: "Roster", tone: "neutral" },
  "team.member_remove": { label: "Roster", tone: "neutral" },
  "team.member_move": { label: "Roster", tone: "neutral" },
  "member.join_by_code": { label: "Joined", tone: "neutral" },
  "invitation_code.create": { label: "Join code", tone: "neutral" },
  "invitation_code.revoke": { label: "Join code", tone: "alert" },
  "event.delete": { label: "Calendar", tone: "alert" },
  "event.session_cancel": { label: "Calendar", tone: "neutral" },
  "academy_qr.regenerate": { label: "QR", tone: "neutral" },
  "academy.qr_regenerate": { label: "QR", tone: "neutral" },
  "academy.admin_appoint": { label: "Admin", tone: "neutral" },
  "academy.admin_remove": { label: "Admin", tone: "alert" },
  "academy.admin_invite": { label: "Admin", tone: "neutral" },
  "academy.admin_invite_cancel": { label: "Admin", tone: "neutral" },
  "academy.create": { label: "Academy", tone: "neutral" },
  "academy.delete": { label: "Academy", tone: "alert" },
  "user.impersonate_start": { label: "Support", tone: "alert" },
  "user.impersonate_stop": { label: "Support", tone: "neutral" },
};

export function auditKind(action: string): AuditKind {
  return (
    KIND[action] ?? {
      label: action.split(".")[0]?.replaceAll("_", " ") ?? action,
      tone: action.endsWith(".void") ? "alert" : "neutral",
    }
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** "Sharika D." */
export function shortName(name: string): string {
  const words = name.trim().split(WHITESPACE);
  const last = words.length > 1 ? words.at(-1)?.[0] : null;
  return last ? `${words[0]} ${last}.` : (words[0] ?? name);
}

/**
 * Who did it: "Sharika D."; "Innocent M. as Sharika D." when the platform owner acted
 * while impersonating them; "You" (phone) for the viewer; "System" for webhooks.
 */
export function whoLabel(
  entry: AuditLogItem,
  options: { viewerId?: Id; short?: boolean } = {}
): string {
  const name = (value: string) => (options.short ? shortName(value) : value);
  const { actor } = entry;
  if (entry.impersonatedBy) {
    return `${name(entry.impersonatedBy.name)} as ${actor ? name(actor.name) : "someone"}`;
  }
  if (!actor) {
    return "System";
  }
  if (options.viewerId && actor.id === options.viewerId) {
    return "You";
  }
  return name(actor.name);
}

/** The sentence after the actor, lower case: "voided a payment for **Samuel Mugabo**". */
function phraseBody(entry: AuditLogItem, name: ReactNode): ReactNode {
  const after = entry.after ?? {};
  const before = entry.before ?? {};
  switch (entry.action) {
    case "fee.create":
      return entry.actor ? (
        <>recorded a payment for {name}</>
      ) : (
        <>paid online for {name}</>
      );
    case "fee.void":
      return <>voided a payment for {name}</>;
    case "attendance.void":
      return <>voided attendance for {name}</>;
    case "attendance.check_out":
      return <>checked out {name}</>;
    case "attendance.verify":
      return <>ticked {name} as seen</>;
    case "attendance.unverify":
      return <>unticked {name}</>;
    case "record.verify":
      return (
        <>
          verified {name}’s {entry.summary ?? "record"}
        </>
      );
    case "record.reject":
      return (
        <>
          rejected {name}’s {entry.summary ?? "record"}
        </>
      );
    case "team.member_add":
      // A join code puts the student on the team themself.
      if (entry.subject && entry.subject.id === entry.actor?.id) {
        return <>joined {entry.summary ?? "a team"}</>;
      }
      return (
        <>
          added {name} to {entry.summary ?? "a team"}
        </>
      );
    case "team.member_remove":
      return (
        <>
          removed {name} from {entry.summary ?? "a team"}
        </>
      );
    case "team.member_move":
      return (
        <>
          moved {name} from {text(before.team)} to {text(after.team)}
        </>
      );
    case "member.join_by_code":
      return <>joined with a join code</>;
    case "invitation_code.create":
      return <>made a join code</>;
    case "invitation_code.revoke":
      return <>turned off a join code</>;
    case "event.delete":
      return <>deleted {entry.summary ? `“${entry.summary}”` : "an event"}</>;
    case "event.session_cancel":
      return (
        <>cancelled {entry.summary ? `“${entry.summary}”` : "a session"}</>
      );
    case "academy_qr.regenerate":
    case "academy.qr_regenerate":
      return <>regenerated the academy QR code</>;
    default:
      return platformPhrase(entry, name);
  }
}

/** Academy admin, academy and support-access rows (written by the platform owner). */
function platformPhrase(entry: AuditLogItem, name: ReactNode): ReactNode {
  const after = entry.after ?? {};
  const before = entry.before ?? {};
  switch (entry.action) {
    case "academy.admin_appoint":
      return <>made {name} an academy admin</>;
    case "academy.admin_remove":
      return <>removed {name} as an academy admin</>;
    case "academy.admin_invite":
      return (
        <>
          invited{" "}
          {text(after.email) ? (
            <strong className="font-semibold">{text(after.email)}</strong>
          ) : (
            "someone"
          )}{" "}
          as an academy admin
        </>
      );
    case "academy.admin_invite_cancel":
      return (
        <>
          cancelled the admin invitation for{" "}
          {text(before.email) || text(after.email) || "someone"}
        </>
      );
    case "academy.create":
      return <>created the academy</>;
    case "academy.delete":
      return <>deleted the academy</>;
    case "user.impersonate_start":
      return <>started support access as {name}</>;
    case "user.impersonate_stop":
      return <>ended support access as {name}</>;
    default:
      return (
        <>
          {entry.action.replaceAll("_", " ")} {entry.subject ? name : null}
        </>
      );
  }
}

/** A short trailing note for actions whose summary isn't a detail. */
function trailing(entry: AuditLogItem): string | null {
  if (
    entry.action === "academy_qr.regenerate" ||
    entry.action === "academy.qr_regenerate"
  ) {
    return "old prints stopped working";
  }
  if (
    entry.action.startsWith("record.") ||
    entry.action.startsWith("team.member_") ||
    entry.action.startsWith("event.")
  ) {
    return null;
  }
  return entry.summary;
}

function subjectName(entry: AuditLogItem): ReactNode {
  return entry.subject ? (
    <strong className="font-semibold">{entry.subject.name}</strong>
  ) : (
    "someone"
  );
}

/** Desktop and tablet: "Voided a payment for **Samuel Mugabo** · RWF 30,000". */
export function describeAudit(entry: AuditLogItem): ReactNode {
  const extra = trailing(entry);
  let sentence: ReactNode = (
    // Capitalises the first letter of the lower-case phrase.
    <span className="inline-block first-letter:uppercase">
      {phraseBody(entry, subjectName(entry))}
    </span>
  );
  if (entry.action === "member.join_by_code") {
    sentence = (
      <>
        {entry.subject ? subjectName(entry) : "Someone"} joined with a join code
      </>
    );
  } else if (entry.action === "fee.create" && !entry.actor) {
    sentence = <>{subjectName(entry)} paid online</>;
  }
  return (
    <>
      {sentence}
      {extra ? ` · ${extra}` : null}
    </>
  );
}

/** Phone: "**You** recorded a payment for **Jean Mugisha**" (detail goes underneath). */
export function describeAuditWithActor(
  entry: AuditLogItem,
  viewerId: Id
): ReactNode {
  if (entry.action === "member.join_by_code") {
    return <>{subjectName(entry)} joined with a join code</>;
  }
  const isOnlinePayment = entry.action === "fee.create" && !entry.actor;
  if (isOnlinePayment) {
    return <>{subjectName(entry)} paid online</>;
  }
  return (
    <>
      <strong className="font-semibold">
        {whoLabel(entry, { viewerId, short: true })}
      </strong>{" "}
      {phraseBody(entry, subjectName(entry))}
    </>
  );
}

/** Phone second line: "Cash · RWF 30,000 · November", or the trailing note. */
export function auditDetailLine(entry: AuditLogItem): string | null {
  return entry.detail ?? trailing(entry);
}
