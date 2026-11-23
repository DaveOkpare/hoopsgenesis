import { expo } from "@better-auth/expo";
import type { Database } from "@hoops-genesis/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { admin, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { organizationSchema, userAdditionalFields } from "./additional-fields";
import { ac, academyRoles } from "./permissions";

export interface AuthConfig {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}

const PLATFORM_ADMIN_ROLE = "admin";
const STUDENT_ROLE = "student";
const ONE_TEAM_PER_STUDENT_MESSAGE =
  "A student can be on only one team per academy";

/** Member and user roles can hold several comma-separated roles. */
const hasRole = (roles: string | null | undefined, role: string): boolean =>
  (roles ?? "")
    .split(",")
    .map((value) => value.trim())
    .includes(role);

export function createAuth(env: AuthConfig, database: Database) {
  return betterAuth({
    database: prismaAdapter(database, {
      provider: "postgresql",
    }),
    trustedOrigins: [
      env.BETTER_AUTH_URL,
      "hoops-genesis://",
      "exp://",
      "http://localhost:8081",
    ],
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: userAdditionalFields,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [
      expo(),
      admin(),
      organization({
        ac,
        roles: academyRoles,
        teams: { enabled: true },
        schema: organizationSchema,
        // Only platform admins may create an academy.
        allowUserToCreateOrganization: (user) =>
          hasRole(user.role, PLATFORM_ADMIN_ROLE),
        organizationHooks: {
          // A student can't be invited onto several teams at once.
          beforeCreateInvitation: ({ invitation }) => {
            // In 1.7.12 the hook gets only the first team as `teamId`; the full
            // list is passed (undocumented) as `teamIds`.
            const teamIds: unknown = invitation.teamIds;
            const teamCount = Array.isArray(teamIds) ? teamIds.length : 0;
            if (hasRole(invitation.role, STUDENT_ROLE) && teamCount > 1) {
              throw new APIError("BAD_REQUEST", {
                message: ONE_TEAM_PER_STUDENT_MESSAGE,
              });
            }
            return Promise.resolve();
          },
          // A student is on at most one team per academy; coaches may be on several.
          beforeAddTeamMember: async ({
            teamMember,
            organization: academy,
          }) => {
            const membership = await database.member.findFirst({
              where: { organizationId: academy.id, userId: teamMember.userId },
              select: { role: true },
            });
            if (!hasRole(membership?.role, STUDENT_ROLE)) {
              return;
            }
            const otherTeam = await database.teamMember.findFirst({
              where: {
                userId: teamMember.userId,
                teamId: { not: teamMember.teamId },
                team: { organizationId: academy.id },
              },
              select: { id: true },
            });
            if (otherTeam) {
              throw new APIError("BAD_REQUEST", {
                message: ONE_TEAM_PER_STUDENT_MESSAGE,
              });
            }
          },
        },
      }),
      // Must stay last: it sets cookies from the responses of the plugins above.
      tanstackStartCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];
