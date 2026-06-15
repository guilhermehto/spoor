/**
 * Dev-only database seed.
 *
 * Creates a ready-to-use admin account so `pnpm dev` drops you straight onto a
 * working login (the same credentials are pre-filled on the form). Idempotent
 * and safe to re-run; refuses to run in production.
 *
 * Wired into the `dev` script after `db:migrate`. We go through better-auth's
 * own sign-up API rather than inserting into the user/account tables by hand,
 * so the stored password hash matches exactly what `signIn.email` expects.
 */
import { eq } from "drizzle-orm";
import { db } from "~/db/index";
import { user } from "~/db/schema";
import { auth } from "~/lib/auth";
import { DEV_ACCOUNT } from "~/lib/dev-account";

async function seedDevAccount(): Promise<void> {
  if (process.env["NODE_ENV"] === "production") {
    console.log("[seed] Skipped — refusing to seed in production.");
    return;
  }

  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, DEV_ACCOUNT.email))
    .limit(1);

  if (existing) {
    console.log(`[seed] Dev account already present: ${DEV_ACCOUNT.email}`);
    return;
  }

  try {
    await auth.api.signUpEmail({
      body: {
        name: DEV_ACCOUNT.name,
        email: DEV_ACCOUNT.email,
        password: DEV_ACCOUNT.password,
      },
    });
    console.log(
      `[seed] Created dev account → ${DEV_ACCOUNT.email} / ${DEV_ACCOUNT.password}`,
    );
  } catch (err) {
    // Most likely another admin already exists (single-admin posture). Don't
    // fail the dev boot over it — just explain why the account wasn't seeded.
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[seed] Skipped dev account: ${message}`);
  }
}

// Always exit 0 so a seed hiccup never blocks `vite dev` in the dev chain.
seedDevAccount()
  .catch((err) => {
    console.error("[seed] Unexpected error (continuing):", err);
  })
  .finally(() => process.exit(0));
