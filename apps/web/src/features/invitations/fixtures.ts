/*
 * Invitation fixtures for the invite screens (only api.ts imports this).
 * Each id below produces one state of /invite/$invitationId:
 *   invite-aline           pending  -> create account (62J-0 / 62L-0)
 *   invite-aline-expired   expired  -> "This invite has expired" (5BQ-0)
 *   invite-aline-accepted  accepted -> "already used" note
 * Any other id is "not found". The joined state (59H-0) is ?state=joined.
 */
import { invitations } from "@/features/fixtures";
import type { Invitation } from "@/features/types";

const shared = invitations.find((invite) => invite.id === "invite-aline");
if (!shared) {
  throw new Error("Fixture invitation invite-aline is missing");
}

export const inviteFixtures: Invitation[] = [
  shared,
  {
    id: "invite-aline-expired",
    academyId: "acad-kigali",
    email: "aline.u@example.com",
    role: "student",
    teamId: "team-u14",
    status: "pending",
    inviterId: "user-sharika",
    createdAt: "2026-11-18T07:15:00Z",
    expiresAt: "2026-11-20T07:15:00Z",
  },
  {
    id: "invite-aline-accepted",
    academyId: "acad-kigali",
    email: "aline.u@example.com",
    role: "student",
    teamId: "team-u14",
    status: "accepted",
    inviterId: "user-sharika",
    createdAt: "2026-11-21T08:14:00Z",
    expiresAt: "2026-11-23T08:14:00Z",
  },
];

/** The session shown on "You're in" (59H-0): Wed 16:00 · Court 2. */
export const JOINED_NEXT_EVENT_ID = "event-u14-training-wed";
