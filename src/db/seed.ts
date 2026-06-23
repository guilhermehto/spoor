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
import { eq, and } from "drizzle-orm";
import { db } from "~/db/index";
import {
  user,
  projects,
  analyticsSessions,
  analyticsEvents,
} from "~/db/schema";
import { auth } from "~/lib/auth";
import { DEV_ACCOUNT } from "~/lib/dev-account";
import { randomBytes } from "node:crypto";

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

// ── Demo analytics seed (dev-only) ────────────────────────────────────────────
//
// ponytail: static synthetic seed, dev-only. Deterministic LCG so reruns are
// stable; idempotency comes from the project-name guard, not the RNG.

const DEMO_PAGES = [
  "/",
  "/blog/privacy-first-analytics",
  "/pricing",
  "/docs/install",
  "/blog/no-cookies-no-banners",
  "/changelog",
] as const;
const DEMO_REFERRERS = [
  "news.ycombinator.com",
  "google.com",
  "github.com",
  "duckduckgo.com",
  "reddit.com",
  "lobste.rs",
] as const;
const DEMO_CLICKS = [
  "Docs: install opened",
  "Copy install snippet",
  "Upgrade clicked",
] as const;
const DEMO_CUSTOM: Array<{ name: string; props: () => Record<string, string> }> = [
  { name: "signup", props: () => ({ plan: pick(["free", "pro", "team"]) }) },
  { name: "purchase", props: () => ({ plan: pick(["pro", "team"]) }) },
  { name: "newsletter_subscribe", props: () => ({ src: pick(["footer", "blog"]) }) },
];
const DEMO_HOST = "spoor.example";

let rngState = 0x2545f4;
function rnd(): number {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return rngState / 0x7fffffff;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)] as T;
}
function pickInt(min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}

async function seedDemoAnalytics(): Promise<void> {
  if (process.env["NODE_ENV"] === "production") return;

  const [devUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, DEV_ACCOUNT.email))
    .limit(1);
  if (!devUser) {
    console.log("[seed] No dev account; skipping demo analytics.");
    return;
  }

  // Idempotent: bail if the dev user already owns the demo project.
  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.userId, devUser.id), eq(projects.name, "Indie Letters")))
    .limit(1);
  if (existing) {
    console.log(`[seed] Demo project already present → ${existing.id}`);
    return;
  }

  const projectId = crypto.randomUUID();
  await db.insert(projects).values({
    id: projectId,
    userId: devUser.id,
    name: "Indie Letters",
    publicKey: randomBytes(16).toString("hex"),
  });

  const now = Date.now();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const sessionRows: (typeof analyticsSessions.$inferInsert)[] = [];
  const eventRows: (typeof analyticsEvents.$inferInsert)[] = [];

  for (let i = 0; i < 12; i++) {
    const sessionId = crypto.randomUUID();
    const visitorHash = `demo-visitor-${pickInt(1, 8)}`;
    const entryPath = pick(DEMO_PAGES);
    const referrer = pick(DEMO_REFERRERS);
    const startedAt = new Date(now - WEEK_MS + Math.floor(rnd() * WEEK_MS));
    let cursor = startedAt.getTime();
    let currentPath: string = entryPath;

    // Entry pageview carries the session referrer.
    eventRows.push({
      id: crypto.randomUUID(),
      projectId,
      sessionId,
      type: "pageview",
      name: "",
      path: currentPath,
      host: DEMO_HOST,
      referrer,
      props: null,
      createdAt: new Date(cursor),
    });

    const steps = pickInt(2, 6);
    for (let s = 1; s < steps; s++) {
      cursor += pickInt(5, 90) * 1000;
      const roll = rnd();
      if (roll < 0.5) {
        currentPath = pick(DEMO_PAGES);
        eventRows.push({
          id: crypto.randomUUID(),
          projectId,
          sessionId,
          type: "pageview",
          name: "",
          path: currentPath,
          host: DEMO_HOST,
          referrer: "",
          props: null,
          createdAt: new Date(cursor),
        });
      } else if (roll < 0.8) {
        eventRows.push({
          id: crypto.randomUUID(),
          projectId,
          sessionId,
          type: "click",
          name: pick(DEMO_CLICKS),
          path: currentPath,
          host: DEMO_HOST,
          referrer: "",
          props: null,
          createdAt: new Date(cursor),
        });
      } else {
        const ce = pick(DEMO_CUSTOM);
        eventRows.push({
          id: crypto.randomUUID(),
          projectId,
          sessionId,
          type: "custom",
          name: ce.name,
          path: currentPath,
          host: DEMO_HOST,
          referrer: "",
          props: ce.props(),
          createdAt: new Date(cursor),
        });
      }
    }

    sessionRows.push({
      id: sessionId,
      projectId,
      visitorHash,
      startedAt,
      lastSeenAt: new Date(cursor), // > startedAt: cursor always advances ≥ once (steps ≥ 2)
      entryPath,
      referrer,
    });
  }

  // FK order: project → sessions → events.
  await db.insert(analyticsSessions).values(sessionRows);
  await db.insert(analyticsEvents).values(eventRows);

  console.log(
    `[seed] Created demo project 'Indie Letters' → ${projectId} (${sessionRows.length} sessions, ${eventRows.length} events)`,
  );
}

// Always exit 0 so a seed hiccup never blocks `vite dev` in the dev chain.
seedDevAccount()
  .then(seedDemoAnalytics)
  .catch((err) => {
    console.error("[seed] Unexpected error (continuing):", err);
  })
  .finally(() => process.exit(0));
