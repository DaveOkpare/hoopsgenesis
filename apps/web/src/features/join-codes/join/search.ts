import type { JoinPageSearch } from "@/features/join-codes/join/join-page";

/**
 * /join search params:
 *   ?state=joined          "You're in" (after joining; /join/<code> only)
 *   ?account=new           signed out: the create-account form
 *   ?as=student|signed-out UI preview only: who is signed in (default Claire, new)
 */
export function parseJoinSearch(
  search: Record<string, unknown>
): JoinPageSearch {
  const out: JoinPageSearch = {};
  if (search.state === "joined") {
    out.state = "joined";
  }
  if (search.account === "new") {
    out.account = "new";
  }
  if (search.as === "student" || search.as === "signed-out") {
    out.as = search.as;
  }
  return out;
}
