import { expo } from "@better-auth/expo";
import type { Database } from "@hoops-genesis/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { tanstackStartCookies } from "better-auth/tanstack-start";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
};

export function createAuth(env: AuthConfig, database: Database) {
  return betterAuth({
    database: prismaAdapter(database, {
      provider: "postgresql",
    }),
    trustedOrigins: [env.BETTER_AUTH_URL, "hoops-genesis://", "exp://", "http://localhost:8081"],
    emailAndPassword: { enabled: true },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [tanstackStartCookies(), expo()],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
