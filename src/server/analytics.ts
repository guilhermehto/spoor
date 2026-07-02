/**
 * Analytics query layer.
 *
 * Every exported function accepts (db, projectId, range, …) and returns plain
 * rows — no HTTP coupling, no createServerFn wrapper.  Step-8 loaders call
 * these via createServerFn after verifying project ownership.
 *
 * Ownership guard: callers must pass a projectId that has already been
 * verified to belong to the authenticated user (use requireOwnedProject below).
 *
 * Unique-visitor counting: visitor_hash lives on analytics_sessions, not on
 * analytics_events.  Queries that need unique visitors JOIN through the session.
 */

import { eq, and, gt, gte, lte, ne, sql, desc, asc, count, countDistinct, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "~/db/schema";
import { analyticsEvents, analyticsSessions, projects } from "~/db/schema";
import {
  bucketGranularity,
  bucketKey,
  enumerateBuckets,
  type DateRange,
} from "./analytics-buckets";
import { resolveEventConstraints, type EventFilters } from "~/lib/event-filters";

// Re-export DateRange so callers only need one import.
export type { DateRange };

// JSON-safe value type — used for event props so createServerFn can serialize it.
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type DB = PostgresJsDatabase<typeof schema>;

// ── Ownership guard ───────────────────────────────────────────────────────────

/**
 * Verifies that projectId belongs to userId.
 * Throws if the project is not found or belongs to a different user.
 */
export async function requireOwnedProject(
  db: DB,
  projectId: string,
  userId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!row) {
    throw new Error("Project not found or access denied");
  }
}

// ── Range-wide unique visitor count ──────────────────────────────────────────

/**
 * Returns the count of distinct visitor hashes across the entire [from, to]
 * range for a project.  Used for the headline "Unique visitors" card so that
 * a visitor active in multiple time buckets is counted only once.
 */
export async function queryUniqueVisitors(
  db: DB,
  projectId: string,
  range: DateRange,
  filters: EventFilters = {},
): Promise<number> {
  const constraints = resolveEventConstraints(filters);
  const [row] = await db
    .select({
      visitors: countDistinct(analyticsSessions.visitorHash).as("visitors"),
    })
    .from(analyticsEvents)
    .innerJoin(analyticsSessions, eq(analyticsEvents.sessionId, analyticsSessions.id))
    .where(
      and(
        eq(analyticsEvents.projectId, projectId),
        gte(analyticsEvents.createdAt, range.from),
        lte(analyticsEvents.createdAt, range.to),
        constraints.type !== undefined ? eq(analyticsEvents.type, constraints.type) : undefined,
        constraints.path !== undefined ? eq(analyticsEvents.path, constraints.path) : undefined,
        constraints.name !== undefined ? eq(analyticsEvents.name, constraints.name) : undefined,
      ),
    );
  return Number(row?.visitors ?? 0);
}

// ── Range-wide error count ────────────────────────────────────────────────────

/**
 * Returns the total number of error events (t = "error") across the [from, to]
 * range for a project.  Powers the headline "Errors" card.
 */
export async function queryErrorCount(
  db: DB,
  projectId: string,
  range: DateRange,
): Promise<number> {
  const [row] = await db
    .select({ total: count(analyticsEvents.id).as("total") })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.projectId, projectId),
        eq(analyticsEvents.type, "error"),
        gte(analyticsEvents.createdAt, range.from),
        lte(analyticsEvents.createdAt, range.to),
      ),
    );
  return Number(row?.total ?? 0);
}

// ── Error groups ──────────────────────────────────────────────────────────────

export interface ErrorGroup {
  name: string;
  count: number;
  lastSeen: Date;
  samplePath: string;
  sampleProps: JsonValue | null;
}

/**
 * Returns error events (t = "error") within [from, to] grouped by message
 * (`name`), ranked by count desc (cap `limit`, default 50), each with the
 * newest event's path/props as a representative sample.
 */
export async function queryErrorGroups(
  db: DB,
  projectId: string,
  range: DateRange,
  opts: { limit?: number } = {},
): Promise<ErrorGroup[]> {
  const limit = opts.limit ?? 50;
  const errorScope = and(
    eq(analyticsEvents.projectId, projectId),
    eq(analyticsEvents.type, "error"),
    gte(analyticsEvents.createdAt, range.from),
    lte(analyticsEvents.createdAt, range.to),
  );

  const groups = await db
    .select({
      name: analyticsEvents.name,
      total: count(analyticsEvents.id).as("total"),
      lastSeen: sql<Date>`max(${analyticsEvents.createdAt})`
        .mapWith(analyticsEvents.createdAt)
        .as("last_seen"),
    })
    .from(analyticsEvents)
    .where(errorScope)
    .groupBy(analyticsEvents.name)
    .orderBy(desc(count(analyticsEvents.id)), asc(analyticsEvents.name))
    .limit(limit);

  if (groups.length === 0) return [];

  // ponytail: second DISTINCT ON query for the newest sample per group —
  // simpler than a lateral join and fine at ≤50 groups.
  const samples = await db
    .selectDistinctOn([analyticsEvents.name], {
      name: analyticsEvents.name,
      path: analyticsEvents.path,
      props: analyticsEvents.props,
    })
    .from(analyticsEvents)
    .where(
      and(
        errorScope,
        inArray(
          analyticsEvents.name,
          groups.map((g) => g.name),
        ),
      ),
    )
    .orderBy(asc(analyticsEvents.name), desc(analyticsEvents.createdAt));

  const sampleByName = new Map(samples.map((s) => [s.name, s]));
  return groups.map((g) => {
    const sample = sampleByName.get(g.name);
    return {
      name: g.name,
      count: Number(g.total),
      lastSeen: g.lastSeen,
      samplePath: sample?.path ?? "",
      sampleProps: (sample?.props ?? null) as JsonValue | null,
    };
  });
}

// ── Range-wide pageview total ─────────────────────────────────────────────────

/**
 * Returns the total number of pageview events across the [from, to] range for a
 * project.  Respects EventFilters via the same pageview-default resolution as the
 * other event queries (no filters → counts type='pageview').
 */
export async function queryPageviewTotal(
  db: DB,
  projectId: string,
  range: DateRange,
  filters: EventFilters = {},
): Promise<number> {
  const constraints = resolveEventConstraints(filters);
  const [row] = await db
    .select({ total: count(analyticsEvents.id).as("total") })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.projectId, projectId),
        gte(analyticsEvents.createdAt, range.from),
        lte(analyticsEvents.createdAt, range.to),
        constraints.type !== undefined ? eq(analyticsEvents.type, constraints.type) : undefined,
        constraints.path !== undefined ? eq(analyticsEvents.path, constraints.path) : undefined,
        constraints.name !== undefined ? eq(analyticsEvents.name, constraints.name) : undefined,
      ),
    );
  return Number(row?.total ?? 0);
}

// ── Range-wide session count ──────────────────────────────────────────────────

/**
 * Returns the number of sessions whose `startedAt` falls within [from, to].
 */
export async function querySessionCount(
  db: DB,
  projectId: string,
  range: DateRange,
): Promise<number> {
  const [row] = await db
    .select({ total: count(analyticsSessions.id).as("total") })
    .from(analyticsSessions)
    .where(
      and(
        eq(analyticsSessions.projectId, projectId),
        gte(analyticsSessions.startedAt, range.from),
        lte(analyticsSessions.startedAt, range.to),
      ),
    );
  return Number(row?.total ?? 0);
}

// ── Average session duration ──────────────────────────────────────────────────

/**
 * Returns the average session duration in **seconds** (lastSeenAt − startedAt)
 * over sessions whose `startedAt` falls within [from, to].  Returns 0 when the
 * range contains no sessions.
 */
export async function queryAvgSessionDuration(
  db: DB,
  projectId: string,
  range: DateRange,
): Promise<number> {
  const [row] = await db
    .select({
      avgSeconds:
        sql<number | null>`avg(extract(epoch from (${analyticsSessions.lastSeenAt} - ${analyticsSessions.startedAt})))`.as(
          "avg_seconds",
        ),
    })
    .from(analyticsSessions)
    .where(
      and(
        eq(analyticsSessions.projectId, projectId),
        gte(analyticsSessions.startedAt, range.from),
        lte(analyticsSessions.startedAt, range.to),
      ),
    );
  return Math.round(Number(row?.avgSeconds ?? 0));
}

// ── Bounce rate ───────────────────────────────────────────────────────────────

/**
 * Returns the percentage (0-100, rounded) of sessions started within
 * [from, to] that recorded exactly one pageview event.  Returns 0 when the
 * range contains no sessions.
 */
export async function queryBounceRate(
  db: DB,
  projectId: string,
  range: DateRange,
): Promise<number> {
  // ponytail: correlated subquery per session — fine at self-hosted volumes,
  // switch to a LEFT JOIN + GROUP BY if it shows up in slow-query logs.
  const [row] = await db
    .select({
      pct: sql<number | null>`round(avg(case when (select count(*) from ${analyticsEvents} where ${analyticsEvents.sessionId} = ${analyticsSessions.id} and ${analyticsEvents.type} = 'pageview') = 1 then 100.0 else 0 end))`.as(
        "pct",
      ),
    })
    .from(analyticsSessions)
    .where(
      and(
        eq(analyticsSessions.projectId, projectId),
        gte(analyticsSessions.startedAt, range.from),
        lte(analyticsSessions.startedAt, range.to),
      ),
    );
  return Number(row?.pct ?? 0);
}

// ── Live active visitors ──────────────────────────────────────────────────────

/**
 * Returns the count of distinct visitors seen in the last 5 minutes.
 */
export async function queryActiveVisitors(db: DB, projectId: string): Promise<number> {
  const [row] = await db
    .select({
      active: countDistinct(analyticsSessions.visitorHash).as("active"),
    })
    .from(analyticsSessions)
    .where(
      and(
        eq(analyticsSessions.projectId, projectId),
        gt(analyticsSessions.lastSeenAt, sql`now() - interval '5 minutes'`),
      ),
    );
  return Number(row?.active ?? 0);
}

// ── Any-event existence check ─────────────────────────────────────────────────

/**
 * Returns whether the project has recorded at least one event, ever.
 * Powers the first-event onboarding callout.
 */
export async function queryHasAnyEvents(db: DB, projectId: string): Promise<boolean> {
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(analyticsEvents)
    .where(eq(analyticsEvents.projectId, projectId))
    .limit(1);
  return rows.length > 0;
}

// ── Time-series: pageviews + unique visitors per bucket ───────────────────────

export interface TimeSeriesBucket {
  bucket: string; // "YYYY-MM-DDTHH:00:00Z" or "YYYY-MM-DD"
  views: number;
  visitors: number;
}

/**
 * Returns pageview counts and unique visitor counts per time bucket.
 *
 * Granularity is chosen automatically from the range span:
 *   ≤ 2 days → hour buckets; > 2 days → day buckets.
 *
 * Buckets with zero events are filled in with views=0, visitors=0.
 */
export async function queryTimeSeries(
  db: DB,
  projectId: string,
  range: DateRange,
  filters: EventFilters = {},
): Promise<TimeSeriesBucket[]> {
  const granularity = bucketGranularity(range);
  // date_trunc requires a literal string unit — use sql.raw to avoid parameterization.
  const bucketExpr = sql<string>`date_trunc(${sql.raw(`'${granularity}'`)}, ${analyticsEvents.createdAt} AT TIME ZONE 'UTC')`;

  const constraints = resolveEventConstraints(filters);

  // Raw query: join events → sessions to get visitor_hash, group by bucket.
  const rows = await db
    .select({
      bucket: bucketExpr.as("bucket"),
      views: count(analyticsEvents.id).as("views"),
      visitors: countDistinct(analyticsSessions.visitorHash).as("visitors"),
    })
    .from(analyticsEvents)
    .innerJoin(analyticsSessions, eq(analyticsEvents.sessionId, analyticsSessions.id))
    .where(
      and(
        eq(analyticsEvents.projectId, projectId),
        gte(analyticsEvents.createdAt, range.from),
        lte(analyticsEvents.createdAt, range.to),
        constraints.type !== undefined ? eq(analyticsEvents.type, constraints.type) : undefined,
        constraints.path !== undefined ? eq(analyticsEvents.path, constraints.path) : undefined,
        constraints.name !== undefined ? eq(analyticsEvents.name, constraints.name) : undefined,
      ),
    )
    .groupBy(bucketExpr)
    .orderBy(bucketExpr);

  // Build a lookup map from bucket key → counts
  const byBucket = new Map<string, { views: number; visitors: number }>();
  for (const row of rows) {
    // Postgres returns date_trunc as a timestamp string; parse to Date.
    const ts = new Date(row.bucket);
    const key = bucketKey(ts, granularity);
    byBucket.set(key, {
      views: Number(row.views),
      visitors: Number(row.visitors),
    });
  }

  // Fill in all buckets (including zero-count ones)
  const allBuckets = enumerateBuckets(range, granularity);
  return allBuckets.map((key) => ({
    bucket: key,
    views: byBucket.get(key)?.views ?? 0,
    visitors: byBucket.get(key)?.visitors ?? 0,
  }));
}

// ── Top pages ─────────────────────────────────────────────────────────────────

export interface TopPage {
  path: string;
  views: number;
}

/**
 * Returns the top pages by pageview count within the date range.
 */
export async function queryTopPages(
  db: DB,
  projectId: string,
  range: DateRange,
  opts: { limit?: number; offset?: number; filters?: EventFilters } = {},
): Promise<TopPage[]> {
  const limit = opts.limit ?? 10;
  const offset = opts.offset ?? 0;
  const constraints = resolveEventConstraints(opts.filters ?? {});

  const rows = await db
    .select({
      path: analyticsEvents.path,
      views: count(analyticsEvents.id).as("views"),
    })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.projectId, projectId),
        gte(analyticsEvents.createdAt, range.from),
        lte(analyticsEvents.createdAt, range.to),
        constraints.type !== undefined ? eq(analyticsEvents.type, constraints.type) : undefined,
        constraints.path !== undefined ? eq(analyticsEvents.path, constraints.path) : undefined,
        constraints.name !== undefined ? eq(analyticsEvents.name, constraints.name) : undefined,
      ),
    )
    .groupBy(analyticsEvents.path)
    .orderBy(desc(count(analyticsEvents.id)), asc(analyticsEvents.path))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({ path: r.path, views: Number(r.views) }));
}

// ── Top referrers ─────────────────────────────────────────────────────────────

export interface TopReferrer {
  referrer: string;
  views: number;
}

/**
 * Returns the top referrers by pageview count, excluding self-referrals
 * (where the referrer host matches the event's host field).
 *
 * Self-referral exclusion: we compare the hostname extracted from the referrer
 * URL against the event's `host` column.  We use Postgres string functions to
 * extract the host from the referrer URL.  Empty referrers are also excluded.
 */
export async function queryTopReferrers(
  db: DB,
  projectId: string,
  range: DateRange,
  opts: { limit?: number; offset?: number; filters?: EventFilters } = {},
): Promise<TopReferrer[]> {
  const limit = opts.limit ?? 10;
  const offset = opts.offset ?? 0;
  const constraints = resolveEventConstraints(opts.filters ?? {});

  // Exclude rows where referrer is empty or where the referrer host equals the
  // page host.  We use a Postgres expression to extract the host from the
  // referrer URL: regexp_replace to strip the scheme and path.
  const rows = await db
    .select({
      referrer: analyticsEvents.referrer,
      views: count(analyticsEvents.id).as("views"),
    })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.projectId, projectId),
        gte(analyticsEvents.createdAt, range.from),
        lte(analyticsEvents.createdAt, range.to),
        constraints.type !== undefined ? eq(analyticsEvents.type, constraints.type) : undefined,
        constraints.path !== undefined ? eq(analyticsEvents.path, constraints.path) : undefined,
        constraints.name !== undefined ? eq(analyticsEvents.name, constraints.name) : undefined,
        // Exclude empty referrers
        ne(analyticsEvents.referrer, ""),
        // Exclude self-referrals: referrer host ≠ event host
        // Extract host from referrer URL using regexp, compare to host column
        sql`regexp_replace(${analyticsEvents.referrer}, '^https?://([^/?#]*).*$', '\\1') != ${analyticsEvents.host}`,
      ),
    )
    .groupBy(analyticsEvents.referrer)
    .orderBy(desc(count(analyticsEvents.id)), asc(analyticsEvents.referrer))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({ referrer: r.referrer, views: Number(r.views) }));
}

// ── Click / custom event counts ───────────────────────────────────────────────

export interface EventCount {
  name: string;
  type: string;
  count: number;
}

/**
 * Returns click and custom event names with their counts within the date range.
 *
 * The base constraint is always `type IN ('click', 'custom')`.  If `filters`
 * includes a `type` or `name`, those are intersected directly (a
 * `type='pageview'` filter will yield an empty result, which is intended).
 * `resolveEventConstraints` is NOT used here — the pageview-default rule does
 * not apply to the events list.
 */
export async function queryEventCounts(
  db: DB,
  projectId: string,
  range: DateRange,
  opts: { limit?: number; offset?: number; filters?: EventFilters } = {},
): Promise<EventCount[]> {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const filters = opts.filters ?? {};

  const rows = await db
    .select({
      name: analyticsEvents.name,
      type: analyticsEvents.type,
      total: count(analyticsEvents.id).as("total"),
    })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.projectId, projectId),
        sql`${analyticsEvents.type} IN ('click', 'custom')`,
        gte(analyticsEvents.createdAt, range.from),
        lte(analyticsEvents.createdAt, range.to),
        filters.path !== undefined ? eq(analyticsEvents.path, filters.path) : undefined,
        filters.type !== undefined ? eq(analyticsEvents.type, filters.type) : undefined,
        filters.name !== undefined ? eq(analyticsEvents.name, filters.name) : undefined,
      ),
    )
    .groupBy(analyticsEvents.name, analyticsEvents.type)
    .orderBy(desc(count(analyticsEvents.id)), asc(analyticsEvents.name), asc(analyticsEvents.type))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    name: r.name,
    type: r.type,
    count: Number(r.total),
  }));
}

// ── Event property breakdown ──────────────────────────────────────────────────

/**
 * For a single event `name` within [from, to], samples up to 2000 props-bearing
 * events, picks the most frequently-present top-level prop key whose values are
 * scalar (string/number/boolean), and returns its top 6 values as
 * `{ value, pct }` (pct of sampled events that carry the key), sorted desc.
 * Returns `null` when no events carry a scalar prop key.
 *
 * // ponytail: 2000-row JS sample; move to SQL jsonb aggregation if event volume grows.
 */
export async function queryEventPropBreakdown(
  db: DB,
  projectId: string,
  range: DateRange,
  name: string,
): Promise<{ prop: string; dist: Array<{ value: string; pct: number }> } | null> {
  const rows = await db
    .select({ props: analyticsEvents.props })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.projectId, projectId),
        eq(analyticsEvents.name, name),
        gte(analyticsEvents.createdAt, range.from),
        lte(analyticsEvents.createdAt, range.to),
        sql`${analyticsEvents.props} is not null`,
      ),
    )
    .limit(2000);

  // Collect well-formed prop objects and count how often each scalar key appears.
  const objects: Array<{ [key: string]: JsonValue }> = [];
  const keyFreq = new Map<string, number>();
  for (const r of rows) {
    const props = r.props as { [key: string]: JsonValue } | null;
    if (!props || typeof props !== "object" || Array.isArray(props)) continue;
    objects.push(props);
    for (const [k, v] of Object.entries(props)) {
      const t = typeof v;
      if (t === "string" || t === "number" || t === "boolean") {
        keyFreq.set(k, (keyFreq.get(k) ?? 0) + 1);
      }
    }
  }
  if (keyFreq.size === 0) return null;

  // Most frequent scalar key (Map preserves insertion order, so ties keep first-seen).
  let prop = "";
  let best = -1;
  for (const [k, c] of keyFreq) {
    if (c > best) {
      prop = k;
      best = c;
    }
  }

  // Tally that key's scalar values over the events that carry it.
  const valueFreq = new Map<string, number>();
  let sampled = 0;
  for (const props of objects) {
    const v = props[prop];
    const t = typeof v;
    if (t !== "string" && t !== "number" && t !== "boolean") continue;
    sampled++;
    const key = String(v);
    valueFreq.set(key, (valueFreq.get(key) ?? 0) + 1);
  }
  if (sampled === 0) return null;

  const dist = [...valueFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([value, c]) => ({ value, pct: Math.round((c / sampled) * 100) }));

  return { prop, dist };
}

// ── Session list ──────────────────────────────────────────────────────────────

export interface SessionSummary {
  sessionId: string;
  entryPath: string;
  referrer: string;
  startedAt: Date;
  lastSeenAt: Date;
  /** Duration in seconds (lastSeenAt - startedAt). */
  durationSeconds: number;
  eventCount: number;
  /** Pageview events (type='pageview') in the session. */
  pageviewCount: number;
  /** Interaction events (type in 'click'/'custom') in the session. */
  interactionCount: number;
}

/**
 * Returns a paginated list of sessions for a project within the date range,
 * ordered by most-recent first.
 */
export async function querySessions(
  db: DB,
  projectId: string,
  range: DateRange,
  opts: { limit?: number; offset?: number } = {},
): Promise<SessionSummary[]> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const rows = await db
    .select({
      sessionId: analyticsSessions.id,
      entryPath: analyticsSessions.entryPath,
      referrer: analyticsSessions.referrer,
      startedAt: analyticsSessions.startedAt,
      lastSeenAt: analyticsSessions.lastSeenAt,
      eventCount: count(analyticsEvents.id).as("event_count"),
      pageviewCount:
        sql<number>`count(${analyticsEvents.id}) filter (where ${analyticsEvents.type} = 'pageview')`.as(
          "pageview_count",
        ),
      interactionCount:
        sql<number>`count(${analyticsEvents.id}) filter (where ${analyticsEvents.type} in ('click', 'custom'))`.as(
          "interaction_count",
        ),
    })
    .from(analyticsSessions)
    .leftJoin(analyticsEvents, eq(analyticsEvents.sessionId, analyticsSessions.id))
    .where(
      and(
        eq(analyticsSessions.projectId, projectId),
        gte(analyticsSessions.startedAt, range.from),
        lte(analyticsSessions.startedAt, range.to),
      ),
    )
    .groupBy(
      analyticsSessions.id,
      analyticsSessions.entryPath,
      analyticsSessions.referrer,
      analyticsSessions.startedAt,
      analyticsSessions.lastSeenAt,
    )
    .orderBy(desc(analyticsSessions.startedAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    sessionId: r.sessionId,
    entryPath: r.entryPath,
    referrer: r.referrer,
    startedAt: r.startedAt,
    lastSeenAt: r.lastSeenAt,
    durationSeconds: Math.round(
      (r.lastSeenAt.getTime() - r.startedAt.getTime()) / 1000,
    ),
    eventCount: Number(r.eventCount),
    pageviewCount: Number(r.pageviewCount),
    interactionCount: Number(r.interactionCount),
  }));
}

// ── Session timeline ──────────────────────────────────────────────────────────

export interface SessionEvent {
  id: string;
  type: string;
  name: string;
  path: string;
  host: string;
  referrer: string;
  props: { [key: string]: JsonValue } | null;
  createdAt: Date;
  /** Milliseconds since session start. */
  offsetMs: number;
}

/**
 * Returns the ordered event timeline for a single session.
 * Throws if the session does not belong to the given project (ownership check).
 */
export async function querySessionTimeline(
  db: DB,
  projectId: string,
  sessionId: string,
): Promise<SessionEvent[]> {
  // Verify the session belongs to this project
  const [sess] = await db
    .select({ startedAt: analyticsSessions.startedAt })
    .from(analyticsSessions)
    .where(
      and(
        eq(analyticsSessions.id, sessionId),
        eq(analyticsSessions.projectId, projectId),
      ),
    )
    .limit(1);

  if (!sess) {
    throw new Error("Session not found or access denied");
  }

  const sessionStart = sess.startedAt;

  const rows = await db
    .select({
      id: analyticsEvents.id,
      type: analyticsEvents.type,
      name: analyticsEvents.name,
      path: analyticsEvents.path,
      host: analyticsEvents.host,
      referrer: analyticsEvents.referrer,
      props: analyticsEvents.props,
      createdAt: analyticsEvents.createdAt,
    })
    .from(analyticsEvents)
    .where(eq(analyticsEvents.sessionId, sessionId))
    .orderBy(asc(analyticsEvents.createdAt));

  return rows.map((r) => ({
    ...r,
    props: r.props as { [key: string]: JsonValue } | null,
    offsetMs: r.createdAt.getTime() - sessionStart.getTime(),
  }));
}
