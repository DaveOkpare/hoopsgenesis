import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { Id } from "@/features/types";

export type ProfileRole = "coach" | "admin";

/**
 * A roster row's link to the student's profile, keyed by user id:
 * /admin/members/$memberId for admins, /coach/students/$studentId for coaches.
 */
export function ProfileLink({
  viewAs,
  userId,
  className,
  children,
}: {
  viewAs: ProfileRole;
  userId: Id;
  className?: string;
  children: ReactNode;
}) {
  return viewAs === "admin" ? (
    <Link
      className={className}
      params={{ memberId: userId }}
      to="/admin/members/$memberId"
    >
      {children}
    </Link>
  ) : (
    <Link
      className={className}
      params={{ studentId: userId }}
      to="/coach/students/$studentId"
    >
      {children}
    </Link>
  );
}
