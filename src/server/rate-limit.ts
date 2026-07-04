/**
 * Fixed-window in-memory rate limiter for the ingest endpoint.
 */

// ponytail: in-memory per-instance limiter; move to Postgres/Redis if multi-node

export const RATE_LIMIT_MAX = 60;
export const RATE_LIMIT_WINDOW_MS = 10_000;
const MAX_ENTRIES = 10_000;

const windows = new Map<string, { windowStart: number; count: number }>();

/** Returns true when `key` is still under the limit for the current window. */
export function rateLimitOk(key: string, now: number = Date.now()): boolean {
  // Bound memory: on overflow, drop expired entries; if still full, reset.
  if (windows.size > MAX_ENTRIES) {
    for (const [k, v] of windows) {
      if (now - v.windowStart >= RATE_LIMIT_WINDOW_MS) windows.delete(k);
    }
    if (windows.size > MAX_ENTRIES) windows.clear();
  }

  const entry = windows.get(key);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    windows.set(key, { windowStart: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT_MAX;
}
