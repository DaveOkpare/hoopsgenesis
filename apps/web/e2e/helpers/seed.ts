/**
 * Seeding what has no HTTP route yet (academies, member rows, teams, team
 * members, the platform role) straight into the local scratch database.
 * Every call makes new rows with unique ids; nothing here deletes or
 * updates shared data beyond the rows it created.
 */
import { randomUUID } from "node:crypto";

import { createPrismaClient } from "@hoops-genesis/db";

import { ACADEMY_LOCATION } from "./clock";
import { uniqueSuffix } from "./http";

let client: ReturnType<typeof createPrismaClient> | undefined;

export const db = (): ReturnType<typeof createPrismaClient> => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  client ??= createPrismaClient({ DATABASE_URL: url });
  return client;
};

export interface SeededAcademy {
  id: string;
  slug: string;
  timezone: string;
}

export const seedAcademy = async (
  options: { timezone?: string; attendanceRadiusM?: number } = {}
): Promise<SeededAcademy> => {
  const slug = `e2e-academy-${uniqueSuffix()}`;
  const timezone = options.timezone ?? "Africa/Lagos";
  await db().organization.create({
    data: {
      id: randomUUID(),
      name: slug,
      slug,
      createdAt: new Date(),
      timezone,
      defaultCurrency: "NGN",
      latitude: ACADEMY_LOCATION.latitude,
      longitude: ACADEMY_LOCATION.longitude,
      attendanceRadiusM: options.attendanceRadiusM ?? 150,
      qrNonce: randomUUID(),
    },
  });
  const row = await db().organization.findUniqueOrThrow({
    where: { slug },
    select: { id: true, slug: true, timezone: true },
  });
  return row;
};

/** `role` is admin, coach or student (comma-separated for several). */
export const seedMember = async (
  academyId: string,
  userId: string,
  role: string
): Promise<string> => {
  const id = randomUUID();
  await db().member.create({
    data: {
      id,
      organizationId: academyId,
      userId,
      role,
      createdAt: new Date(),
    },
  });
  return id;
};

export const seedTeam = async (
  academyId: string,
  userIds: readonly string[],
  name = `team-${uniqueSuffix()}`
): Promise<string> => {
  const id = randomUUID();
  await db().team.create({
    data: { id, name, organizationId: academyId, createdAt: new Date() },
  });
  if (userIds.length > 0) {
    await seedTeamMembers(id, userIds);
  }
  return id;
};

export const seedTeamMembers = async (
  teamId: string,
  userIds: readonly string[]
): Promise<void> => {
  await db().teamMember.createMany({
    data: userIds.map((userId) => ({
      id: randomUUID(),
      teamId,
      userId,
      createdAt: new Date(),
    })),
  });
};

export const setPlatformRole = async (
  userId: string,
  role: string
): Promise<void> => {
  await db().user.update({ where: { id: userId }, data: { role } });
};

export const readQrNonce = async (academyId: string): Promise<string> => {
  const row = await db().organization.findUniqueOrThrow({
    where: { id: academyId },
    select: { qrNonce: true },
  });
  return row.qrNonce;
};
