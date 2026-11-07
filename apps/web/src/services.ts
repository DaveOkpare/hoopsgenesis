import { createAuth } from "@hoops-genesis/auth";
import { createPrismaClient } from "@hoops-genesis/db";

import { ENV } from "./env.server";

export const db = createPrismaClient(ENV);
export const auth = createAuth(ENV, db);
