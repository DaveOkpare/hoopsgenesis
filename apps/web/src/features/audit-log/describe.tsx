/*
 * How an audit entry reads on screen: the badge ("VOID", "CHECK-OUT", …) and the
 * sentence ("Voided a payment for **Samuel Mugabo** · RWF 30,000").
 */
import type { ReactNode } from "react";

import type { AuditLogItem } from "@/features/audit-log/queries";

export interface AuditKind {
  label: string;
  tone: "alert" | "neutral";
}

/** Badges for the server's other audited actions. */
const KIND_LABEL: Record<string, string> = {
  "fee.create": "Payment",
  "attendance.verify": "Tick",
  "attendance.unverify": "Untick",
  "member.join_by_code": "Roster",
  "event.delete": "Calendar",
  "event.session_cancel": "Calendar",
  "invitation_code.create": "Join code",
  "invitation_code.revoke": "Join code",
  "user.impersonate_start": "Support",
  "user.impersonate_stop": "Support",
};

export function auditKind(action: string): AuditKind {
  if (action.endsWith(".void")) {
    return { label: "Void", tone: "alert" };
  }
  if (action === "attendance.check_out") {
    return { label: "Check-out", tone: "neutral" };
  }
  if (action === "record.verify") {
    return { label: "Verify", tone: "neutral" };
  }
  if (action === "record.reject") {
    return { label: "Reject", tone: "alert" };
  }
  if (action.startsWith("team.")) {
    return { label: "Roster", tone: "neutral" };
  }
  if (
    action === "academy.qr_regenerate" ||
    action === "academy_qr.regenerate"
  ) {
    return { label: "QR", tone: "neutral" };
  }
  return {
    label: KIND_LABEL[action] ?? action.split(".")[0] ?? action,
    tone: "neutral",
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function withDetail(detail: string | null): ReactNode {
  return detail ? ` · ${detail}` : null;
}

/** The "What happened" sentence. Names are bold, as in the design. */
export function describeAudit(entry: AuditLogItem): ReactNode {
  const name = entry.subject ? (
    <strong className="font-semibold">{entry.subject.name}</strong>
  ) : (
    "a student"
  );
  switch (entry.action) {
    case "fee.void":
      return (
        <>
          Voided a payment for {name}
          {withDetail(entry.summary)}
        </>
      );
    case "attendance.void":
      return (
        <>
          Voided attendance for {name}
          {withDetail(entry.summary)}
        </>
      );
    case "attendance.check_out":
      return (
        <>
          Checked out {name}
          {withDetail(entry.summary)}
        </>
      );
    case "record.verify":
      return (
        <>
          Verified {name}’s {entry.summary ?? "record"}
        </>
      );
    case "record.reject":
      return (
        <>
          Rejected {name}’s {entry.summary ?? "record"}
        </>
      );
    case "team.member_move":
      return (
        <>
          Moved {name} from {text(entry.before?.team)} to{" "}
          {text(entry.after?.team)}
        </>
      );
    case "academy.qr_regenerate":
    case "academy_qr.regenerate":
      return "Regenerated the academy QR code · old prints stopped working";
    case "fee.create":
      return (
        <>
          Recorded a payment for {name}
          {withDetail(entry.summary)}
        </>
      );
    case "attendance.verify":
      return (
        <>
          Ticked {name} as seen
          {withDetail(entry.summary)}
        </>
      );
    case "attendance.unverify":
      return (
        <>
          Unticked {name}
          {withDetail(entry.summary)}
        </>
      );
    case "team.member_add":
      return (
        <>
          Added {name} to {entry.summary ?? "a team"}
        </>
      );
    case "team.member_remove":
      return (
        <>
          Removed {name} from {entry.summary ?? "a team"}
        </>
      );
    case "member.join_by_code":
      return <>{entry.subject ? name : "Someone"} joined with a join code</>;
    case "invitation_code.create":
      return "Made a join code";
    case "invitation_code.revoke":
      return "Revoked a join code";
    case "event.delete":
      return "Deleted an event";
    case "event.session_cancel":
      return "Cancelled a session";
    default:
      return (
        <>
          {entry.action} {entry.subject ? name : null}
          {withDetail(entry.summary)}
        </>
      );
  }
}
