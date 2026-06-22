/**
 * Ingest API — core logic (no HTTP framework coupling).
 *
 * Wire payload shape (short keys for sendBeacon compactness):
 *   k  — project public_key (string, required)
 *   t  — event type: "pageview" | "click" | "custom" | "error" (string, required)
 *   n  — event name, e.g. "signup-cta"; carries the message for error events
 *        (string, optional; required for click/custom)
 *   p  — page path, e.g. "/pricing" (string, required)
 *   h  — page hostname, e.g. "example.com" (string, required)
 *   r  — referrer URL (string, optional)
 *   props — arbitrary JSON object (object, optional)
 *
 * Example minimal payload:
 *   {"k":"abc123","t":"pageview","p":"/","h":"example.com"}
 *
 * Sessionization:
 *   A session is identified by (projectId, visitorHash).  An open session is
 *   one whose last_seen_at is within SESSION_TIMEOUT_MS of the current event
 *   time.  resolveSession() is a pure function — it takes the most-recent open
 *   session row (or null) and the current timestamp, and returns whether to
 *   reuse or create a new session.
 */

import { eq, and, desc } from "drizzle-orm";
import { db } from "~/db/index";
import { projects, analyticsSessions, analyticsEvents } from "~/db/schema";
import { computeVisitorHash, extractClientIp } from "./visitor";

// ── Constants ─────────────────────────────────────────────────────────────────

export const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export const MAX_BODY_BYTES = 8 * 1024; // 8 KB
const MAX_PATH_LEN = 512;
const MAX_NAME_LEN = 512;
const MAX_PROPS_SERIALIZED = 2 * 1024; // 2 KB

const VALID_TYPES = new Set(["pageview", "click", "custom", "error"]);

/** Basic bot detection — matches common crawler/bot user-agent substrings. */
const BOT_UA_RE =
  /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|whatsapp|twitterbot|linkedinbot|googlebot|bingbot|yandex|baidu|duckduckbot|sogou|exabot|ia_archiver|semrush|ahrefs|mj12bot|dotbot|rogerbot|archive\.org_bot/i;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IngestPayload {
  k: string; // public_key
  t: string; // type
  n?: string | undefined; // name
  p: string; // path
  h: string; // host
  r?: string | undefined; // referrer
  props?: Record<string, unknown> | undefined;
}

export interface OpenSession {
  id: string;
  lastSeenAt: Date;
}

export type SessionResolution =
  | { action: "reuse"; sessionId: string }
  | { action: "create" };

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Pure function: decides whether to reuse an existing open session or create
 * a new one.  No DB access — unit-testable in isolation.
 *
 * @param openSession  The most-recent session for this visitor, or null.
 * @param now          The current event timestamp.
 */
export function resolveSession(
  openSession: OpenSession | null,
  now: Date,
): SessionResolution {
  if (
    openSession !== null &&
    now.getTime() - openSession.lastSeenAt.getTime() < SESSION_TIMEOUT_MS
  ) {
    return { action: "reuse", sessionId: openSession.id };
  }
  return { action: "create" };
}

/** Returns true when the user-agent string matches a known bot pattern. */
export function isBot(userAgent: string): boolean {
  return BOT_UA_RE.test(userAgent);
}

// ── Validation ────────────────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true; payload: IngestPayload }
  | { ok: false; reason: string };

/**
 * Validates and parses the raw request body.
 * Accepts any Content-Type (sendBeacon sends text/plain).
 */
export function parseAndValidate(
  rawBody: string,
  bodyByteLength: number,
): ValidationResult {
  if (bodyByteLength > MAX_BODY_BYTES) {
    return { ok: false, reason: "body too large" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "invalid JSON" };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "payload must be a JSON object" };
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj["k"] !== "string" || !obj["k"]) {
    return { ok: false, reason: "missing or invalid field: k (public_key)" };
  }
  if (typeof obj["t"] !== "string" || !VALID_TYPES.has(obj["t"])) {
    return {
      ok: false,
      reason: `invalid field: t must be one of ${[...VALID_TYPES].join(", ")}`,
    };
  }
  if (typeof obj["p"] !== "string" || !obj["p"]) {
    return { ok: false, reason: "missing or invalid field: p (path)" };
  }
  if (obj["p"].length > MAX_PATH_LEN) {
    return { ok: false, reason: "field p (path) exceeds 512 chars" };
  }
  if (typeof obj["h"] !== "string" || !obj["h"]) {
    return { ok: false, reason: "missing or invalid field: h (host)" };
  }

  const name = obj["n"] !== undefined ? String(obj["n"]) : "";
  if (name.length > MAX_NAME_LEN) {
    return { ok: false, reason: "field n (name) exceeds 512 chars" };
  }

  let props: Record<string, unknown> | undefined;
  if (obj["props"] !== undefined) {
    if (
      typeof obj["props"] !== "object" ||
      obj["props"] === null ||
      Array.isArray(obj["props"])
    ) {
      return { ok: false, reason: "field props must be a JSON object" };
    }
    const serialized = JSON.stringify(obj["props"]);
    if (serialized.length > MAX_PROPS_SERIALIZED) {
      return { ok: false, reason: "field props exceeds 2 KB serialized" };
    }
    props = obj["props"] as Record<string, unknown>;
  }

  return {
    ok: true,
    payload: {
      k: obj["k"] as string,
      t: obj["t"] as string,
      n: name || undefined,
      p: obj["p"] as string,
      h: obj["h"] as string,
      r: typeof obj["r"] === "string" ? obj["r"] : "",
      props,
    },
  };
}

// ── DB operations ─────────────────────────────────────────────────────────────

/**
 * Looks up a project by its public key.
 * Returns the project row or null if not found.
 */
export async function findProjectByKey(
  publicKey: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.publicKey, publicKey))
    .limit(1);
  return row ?? null;
}

/**
 * Finds the most-recent open session for a visitor within the timeout window.
 */
export async function findOpenSession(
  projectId: string,
  visitorHash: string,
  now: Date,
): Promise<OpenSession | null> {
  const cutoff = new Date(now.getTime() - SESSION_TIMEOUT_MS);
  const [row] = await db
    .select({ id: analyticsSessions.id, lastSeenAt: analyticsSessions.lastSeenAt })
    .from(analyticsSessions)
    .where(
      and(
        eq(analyticsSessions.projectId, projectId),
        eq(analyticsSessions.visitorHash, visitorHash),
      ),
    )
    .orderBy(desc(analyticsSessions.lastSeenAt))
    .limit(1);

  if (!row) return null;
  // Only return if within the timeout window
  if (row.lastSeenAt.getTime() < cutoff.getTime()) return null;
  return { id: row.id, lastSeenAt: row.lastSeenAt };
}

/**
 * Persists one ingest event: creates or reuses a session, inserts the event
 * row, and advances last_seen_at on the session.
 */
export async function persistEvent(opts: {
  projectId: string;
  visitorHash: string;
  payload: IngestPayload;
  now: Date;
}): Promise<void> {
  const { projectId, visitorHash, payload, now } = opts;

  const openSession = await findOpenSession(projectId, visitorHash, now);
  const resolution = resolveSession(openSession, now);

  let sessionId: string;

  if (resolution.action === "reuse") {
    sessionId = resolution.sessionId;
    // Advance last_seen_at
    await db
      .update(analyticsSessions)
      .set({ lastSeenAt: now })
      .where(eq(analyticsSessions.id, sessionId));
  } else {
    // Create a new session
    sessionId = crypto.randomUUID();
    await db.insert(analyticsSessions).values({
      id: sessionId,
      projectId,
      visitorHash,
      startedAt: now,
      lastSeenAt: now,
      entryPath: payload.p,
      referrer: payload.r ?? "",
    });
  }

  // Insert the event
  await db.insert(analyticsEvents).values({
    id: crypto.randomUUID(),
    projectId,
    sessionId,
    type: payload.t,
    name: payload.n ?? "",
    path: payload.p,
    host: payload.h,
    referrer: payload.r ?? "",
    props: payload.props ?? null,
    createdAt: now,
  });
}
