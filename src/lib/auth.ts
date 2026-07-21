import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "~/db/index";
import * as schema from "~/db/schema";
import { count, sql } from "drizzle-orm";
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
        // Serialized via pg advisory xact lock so concurrent first signups can't both see 0.
        // ponytail: lock releases at tx end, before better-auth's insert — race window is
        // near-zero but not strictly gone (fixing needs the insert in the same tx, which
        // better-auth doesn't expose).
        before: async () => {
          const allowed = await db.transaction(async (tx) => {
            await tx.execute(
              sql`select pg_advisory_xact_lock(hashtext('spoor_single_admin'))`,
            );
            const [row] = await tx.select({ total: count() }).from(schema.user);
            return (row?.total ?? 0) === 0;
          });
          if (!allowed) {
            return false;
          }
        },
      },
    },
  },
});

export type Auth = typeof auth;
export type SessionData = typeof auth.$Infer.Session;
