/**
 * Prisma's namespace (model and input types, Decimal, error classes) and the
 * client type handed to `db.$transaction(async (tx) => ...)` callbacks.
 */
import type { Prisma as GeneratedPrisma } from "../prisma/generated/client";

// biome-ignore lint/performance/noBarrelFile: the one entry point to the generated client's namespace
export { Prisma } from "../prisma/generated/client";

export type TransactionClient = GeneratedPrisma.TransactionClient;
