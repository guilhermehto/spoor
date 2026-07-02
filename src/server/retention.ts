/**
 * Opt-in data retention pruning.
 *
 * Set SPOOR_RETENTION_DAYS=N to delete analytics data older than N days.
 * Unset / empty / non-numeric / <= 0 disables the feature entirely.
 *
 * Loaded for its side effect from the ingest route (once at server boot).
 */

import { lt } from "drizzle-orm";
import { db } from "~/db/index";
import { analyticsSessions, analyticsEvents } from "~/db/schema";

/** Parses SPOOR_RETENTION_DAYS; returns null when retention is disabled. */
export function parseRetentionDays(raw: string | undefined): number | null {
  const days = Number(raw);
  return Number.isFinite(days) && days > 0 ? days : null;
}

const RETENTION_DAYS = parseRetentionDays(process.env.SPOOR_RETENTION_DAYS);

async function prune(days: number): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // Stale sessions first — FK cascade deletes their events (see schema.ts).
    const sessions = await db
      .delete(analyticsSessions)
      .where(lt(analyticsSessions.lastSeenAt, cutoff));
    // Then old events of still-open sessions. Note: this can trim the head of
    // a very long-lived session's event timeline — acceptable.
    const events = await db
      .delete(analyticsEvents)
      .where(lt(analyticsEvents.createdAt, cutoff));
    console.log(
      `retention: pruned data older than ${days} days (${sessions.count} sessions, ${events.count} loose events)`,
    );
  } catch (err) {
    // A prune failure must never crash the server.
    console.error("retention: prune failed", err);
  }
}

// ponytail: setInterval in server module, fine single-node; move to external cron if multi-node
// Skip auto-start under vitest so importing this module never touches the DB.
if (RETENTION_DAYS !== null && !process.env.VITEST) {
  void prune(RETENTION_DAYS);
  setInterval(() => void prune(RETENTION_DAYS), 24 * 60 * 60 * 1000).unref();
}
