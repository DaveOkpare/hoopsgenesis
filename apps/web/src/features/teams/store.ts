/*
 * Teams created during this session (fixture mode only). Kept apart from api.ts so the
 * team page (features/team-detail/api.ts) can find a new team without importing the
 * teams API. Delete this module when the real endpoints are plugged in.
 */
import type { Id, Team } from "@/features/types";

/** Teams made with "Create team" (organization.createTeam). Mutable on purpose. */
export const createdTeams: Team[] = [];

/** Sport chosen for each created team (not in the schema yet; "Other" is stored as absent). */
export const createdTeamSports: Record<Id, string> = {};
