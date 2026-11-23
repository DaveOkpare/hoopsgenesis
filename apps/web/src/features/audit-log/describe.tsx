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
  if (action === "academy.qr_regenerate") {
    return { label: "QR", tone: "neutral" };
  }
  return { label: action.split(".")[0] ?? action, tone: "neutral" };
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
      return "Regenerated the academy QR code · old prints stopped working";
    default:
      return (
        <>
          {entry.action} {entry.subject ? name : null}
          {withDetail(entry.summary)}
        </>
      );
  }
}
