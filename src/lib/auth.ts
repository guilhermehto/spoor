import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "~/db/index";
import * as schema from "~/db/schema";
import { count } from "drizzle-orm";
import { BETTER_AUTH_SECRET } from "~/server/config";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  secret: BETTER_AUTH_SECRET,
  baseURL: process.env["BETTER_AUTH_URL"] ?? "http://localhost:5173",
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    user: {
      create: {
        // Reject sign-up when at least one user already exists (single-admin posture).
        before: async () => {
          const [row] = await db
            .select({ total: count() })
            .from(schema.user);
          const total = row?.total ?? 0;
          if (total > 0) {
            return false;
          }
        },
      },
    },
  },
});

export type Auth = typeof auth;
