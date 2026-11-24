/*
 * Sentences for the owner's log. Academy actions read as the academy activity log
 * does (features/audit-log/describe.tsx); the platform-only actions (academies,
 * admins, viewing as someone) are worded here.
 */
import type { ReactNode } from "react";

import { auditKind, describeAudit } from "@/features/audit-log/describe";
import type { OwnerAuditItem } from "@/features/owner-audit/queries";

const PLATFORM_KIND: Record<string, string> = {
  "academy.create": "Academy",
  "academy.delete": "Academy",
  "academy.admin_appoint": "Admin",
  "academy.admin_remove": "Admin",
  "academy.admin_invite": "Admin",
  "academy.admin_invite_cancel": "Admin",
  "user.impersonate_start": "View as",
  "user.impersonate_stop": "View as",
};

export function ownerAuditKind(action: string): {
  label: string;
  tone: "alert" | "neutral";
} {
  const label = PLATFORM_KIND[action];
  if (label) {
    return { label, tone: action === "academy.delete" ? "alert" : "neutral" };
  }
  return auditKind(action);
}

export function describeOwnerAudit(entry: OwnerAuditItem): ReactNode {
  const name = entry.subject ? (
    <strong className="font-semibold">{entry.subject.name}</strong>
  ) : (
    "someone"
  );
  const academyName = entry.academy
    ? `Hoops Genesis ${entry.academy.shortName}`
    : "an academy";
  switch (entry.action) {
    case "academy.create":
      return <>Created {academyName}</>;
    case "academy.delete":
      return "Deleted an academy";
    case "academy.admin_appoint":
      return <>Made {name} an admin</>;
    case "academy.admin_remove":
      return <>Removed {name} as admin</>;
    case "academy.admin_invite":
      return "Invited an admin by email";
    case "academy.admin_invite_cancel":
      return "Cancelled an admin invitation";
    case "user.impersonate_start":
      return <>Started viewing as {name}</>;
    case "user.impersonate_stop":
      return <>Stopped viewing as {name}</>;
    default:
      return describeAudit(entry);
  }
}
