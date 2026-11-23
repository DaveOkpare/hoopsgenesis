import { createAuth } from "@hoops-genesis/auth";
import { createPrismaClient } from "@hoops-genesis/db";

import { ENV } from "./env.server";

// Vercel serves each deployment on several hostnames (the production domain,
// a per-branch URL and a per-deployment URL). BETTER_AUTH_URL covers only one
// of them, so the others must be trusted too or Better Auth rejects requests
// from them with "Invalid origin".
const VERCEL_HOSTNAME_VARIABLES = [
  "VERCEL_URL",
  "VERCEL_BRANCH_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
] as const;

const vercelOrigins: string[] = [];
for (const name of VERCEL_HOSTNAME_VARIABLES) {
  const hostname = process.env[name];
  if (hostname) {
    vercelOrigins.push(`https://${hostname}`);
  }
}

export const db = createPrismaClient(ENV);
export const auth = createAuth(ENV, db, vercelOrigins);
