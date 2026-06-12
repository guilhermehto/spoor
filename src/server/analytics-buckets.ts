/**
 * Pure helpers for analytics date bucketing.
 *
 * Bucket granularity rule:
 *   - range ≤ 2 days  → hour buckets  (UTC ISO string truncated to the hour)
 *   - range  > 2 days → day  buckets  (UTC ISO string truncated to the day)
 *
 * All functions are side-effect-free and unit-testable without DB access.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type BucketGranularity = "hour" | "day";

export interface DateRange {
  from: Date;
  to: Date;
}

// ── Granularity selection ─────────────────────────────────────────────────────

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Returns the bucket granularity for a given date range.
 * Ranges of exactly 2 days or less use hour buckets; longer ranges use day buckets.
 */
export function bucketGranularity(range: DateRange): BucketGranularity {
  const spanMs = range.to.getTime() - range.from.getTime();
  return spanMs <= TWO_DAYS_MS ? "hour" : "day";
}

// ── Bucket key derivation ─────────────────────────────────────────────────────

/**
 * Returns the bucket key string for a given timestamp and granularity.
 *
 * Hour bucket: "YYYY-MM-DDTHH:00:00Z"
 * Day  bucket: "YYYY-MM-DD"
 */
export function bucketKey(ts: Date, granularity: BucketGranularity): string {
  const iso = ts.toISOString(); // always UTC
  if (granularity === "hour") {
    // "2024-06-01T14:37:22.000Z" → "2024-06-01T14:00:00Z"
    return iso.slice(0, 13) + ":00:00Z";
  }
  // "2024-06-01T14:37:22.000Z" → "2024-06-01"
  return iso.slice(0, 10);
}

// ── Bucket enumeration ────────────────────────────────────────────────────────

/**
 * Enumerates every bucket key in [from, to] (inclusive on both ends) for the
 * given granularity.  Useful for filling in zero-count buckets on the client.
 */
export function enumerateBuckets(
  range: DateRange,
  granularity: BucketGranularity,
): string[] {
  const keys: string[] = [];
  const stepMs = granularity === "hour" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  // Snap the start to the bucket boundary
  let cursor = snapToBucket(range.from, granularity);

  while (cursor.getTime() <= range.to.getTime()) {
    keys.push(bucketKey(cursor, granularity));
    cursor = new Date(cursor.getTime() + stepMs);
  }

  return keys;
}

/**
 * Snaps a timestamp down to the start of its bucket (floor).
 */
export function snapToBucket(ts: Date, granularity: BucketGranularity): Date {
  if (granularity === "hour") {
    return new Date(
      Date.UTC(
        ts.getUTCFullYear(),
        ts.getUTCMonth(),
        ts.getUTCDate(),
        ts.getUTCHours(),
        0,
        0,
        0,
      ),
    );
  }
  return new Date(
    Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate(), 0, 0, 0, 0),
  );
}

// ── Postgres date_trunc expression helper ─────────────────────────────────────

/**
 * Returns the Postgres `date_trunc` unit string for a given granularity.
 * Used by analytics.ts to build the GROUP BY expression.
 */
export function pgDateTruncUnit(granularity: BucketGranularity): "hour" | "day" {
  return granularity;
}
