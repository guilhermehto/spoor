/**
 * createServerFn wrappers for the analytics query layer.
 *
 * Each function verifies session ownership before delegating to the pure
 * query functions in analytics.ts.  Callers (loaders) import from here.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSession } from "~/server/session";
import { db } from "~/db/index";
import {
  requireOwnedProject,
  queryTimeSeries,
  queryUniqueVisitors,
  queryErrorCount,
  queryTopPages,
  queryTopReferrers,
  queryEventCounts,
  querySessions,
  querySessionTimeline,
  queryPageviewTotal,
  querySessionCount,
  queryAvgSessionDuration,
  queryBounceRate,
  queryActiveVisitors,
  queryEventPropBreakdown,
  type DateRange,
  type TimeSeriesBucket,
  type SessionSummary,
  type SessionEvent,
  type JsonValue,
} from "./analytics";
import { type EventFilters } from "~/lib/event-filters";

// ── Ranked list types ─────────────────────────────────────────────────────────

export interface RankedRow {
  label: string;
  count: number;
  badge?: string;
  filterValue?: string;
}

export interface RankedPage {
  items: RankedRow[];
  hasMore: boolean;
}

const RANKED_PAGE_SIZE = 10;

// ── Overview ──────────────────────────────────────────────────────────────────

interface OverviewInput {
  projectId: string;
  from: string; // ISO string
  to: string;   // ISO string
  /** Optional filter: restrict to events on this path. */
  path?: string;
  /** Optional filter: restrict to this event type. */
  type?: string;
  /** Optional filter: restrict to this event name. */
  name?: string;
}

export interface OverviewData {
  timeSeries: TimeSeriesBucket[];
  /** Range-wide distinct visitor count (headline card). */
  uniqueVisitors: number;
  /** Range-wide error-event count (headline card). */
  errorCount: number;
  topPages: RankedPage;
  topReferrers: RankedPage;
  eventCounts: RankedPage;
  metrics: {
    pageViews: number;
    uniqueVisitors: number;
    sessions: number;
    avgSessionSeconds: number;
    /** Percentage (0-100) of sessions with exactly one pageview. */
    bounceRate: number;
    /** Percent change vs. the previous window; null when there is no baseline (prev = 0). */
    deltas: {
      pageViews: number | null;
      uniqueVisitors: number | null;
      sessions: number | null;
      avgSessionSeconds: number | null;
      bounceRate: number | null;
    };
  };
}

export const getOverviewFn = createServerFn({ method: "GET" })
  .validator((data: OverviewInput) => data)
  .handler(async ({ data }): Promise<OverviewData> => {
    const session = await requireSession();
    await requireOwnedProject(db, data.projectId, session.user.id);

    const range: DateRange = {
      from: new Date(data.from),
      to: new Date(data.to),
    };

    const filters: EventFilters = {};
    if (data.path) filters.path = data.path;
    if (data.type && (["pageview", "click", "custom"] as string[]).includes(data.type)) {
      const validType = data.type as "pageview" | "click" | "custom";
      filters.type = validType;
    }
    if (data.name) filters.name = data.name;

    const fetchSize = RANKED_PAGE_SIZE + 1;

    // Immediately-preceding equal-length window for deltas: prev = [from−span, from].
    const span = range.to.getTime() - range.from.getTime();
    const prevRange: DateRange = {
      from: new Date(range.from.getTime() - span),
      to: range.from,
    };

    const [
      timeSeries,
      uniqueVisitors,
      errorCount,
      rawPages,
      rawReferrers,
      rawEvents,
      pageViews,
      sessions,
      avgSessionSeconds,
      bounceRate,
      prevPageViews,
      prevVisitors,
      prevSessions,
      prevAvg,
      prevBounce,
    ] = await Promise.all([
      queryTimeSeries(db, data.projectId, range, filters),
      queryUniqueVisitors(db, data.projectId, range, filters),
      queryErrorCount(db, data.projectId, range),
      queryTopPages(db, data.projectId, range, { limit: fetchSize, filters }),
      queryTopReferrers(db, data.projectId, range, { limit: fetchSize, filters }),
      queryEventCounts(db, data.projectId, range, { limit: fetchSize, filters }),
      queryPageviewTotal(db, data.projectId, range, filters),
      querySessionCount(db, data.projectId, range),
      queryAvgSessionDuration(db, data.projectId, range),
      queryBounceRate(db, data.projectId, range),
      queryPageviewTotal(db, data.projectId, prevRange, filters),
      queryUniqueVisitors(db, data.projectId, prevRange, filters),
      querySessionCount(db, data.projectId, prevRange),
      queryAvgSessionDuration(db, data.projectId, prevRange),
      queryBounceRate(db, data.projectId, prevRange),
    ]);

    const topPages: RankedPage = {
      items: rawPages.slice(0, RANKED_PAGE_SIZE).map((p) => ({
        label: p.path,
        count: p.views,
        filterValue: p.path,
      })),
      hasMore: rawPages.length > RANKED_PAGE_SIZE,
    };

    const topReferrers: RankedPage = {
      items: rawReferrers.slice(0, RANKED_PAGE_SIZE).map((r) => ({
        label: r.referrer,
        count: r.views,
        filterValue: r.referrer,
      })),
      hasMore: rawReferrers.length > RANKED_PAGE_SIZE,
    };

    const eventCounts: RankedPage = {
      items: rawEvents.slice(0, RANKED_PAGE_SIZE).map((e) => ({
        label: e.name,
        count: e.count,
        badge: e.type,
        filterValue: e.name,
      })),
      hasMore: rawEvents.length > RANKED_PAGE_SIZE,
    };

    const deltaPct = (cur: number, prev: number): number | null =>
      prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;

    const metrics: OverviewData["metrics"] = {
      pageViews,
      uniqueVisitors,
      sessions,
      avgSessionSeconds,
      bounceRate,
      deltas: {
        pageViews: deltaPct(pageViews, prevPageViews),
        uniqueVisitors: deltaPct(uniqueVisitors, prevVisitors),
        sessions: deltaPct(sessions, prevSessions),
        avgSessionSeconds: deltaPct(avgSessionSeconds, prevAvg),
        bounceRate: deltaPct(bounceRate, prevBounce),
      },
    };

    return {
      timeSeries,
      uniqueVisitors,
      errorCount,
      topPages,
      topReferrers,
      eventCounts,
      metrics,
    };
  });

// ── Live active visitors ──────────────────────────────────────────────────────

export const getActiveNowFn = createServerFn({ method: "GET" })
  .validator((data: { projectId: string }) => data)
  .handler(async ({ data }): Promise<number> => {
    const session = await requireSession();
    await requireOwnedProject(db, data.projectId, session.user.id);
    return queryActiveVisitors(db, data.projectId);
  });

// ── Paginated ranked list ─────────────────────────────────────────────────────

type RankedDimension = "pages" | "referrers" | "events";

interface RankedListInput {
  projectId: string;
  from: string;
  to: string;
  filters?: EventFilters;
  dimension: RankedDimension;
  offset?: number;
}

export const getRankedListFn = createServerFn({ method: "GET" })
  .validator((data: RankedListInput) => data)
  .handler(async ({ data }): Promise<RankedPage> => {
    const session = await requireSession();
    await requireOwnedProject(db, data.projectId, session.user.id);

    const range: DateRange = {
      from: new Date(data.from),
      to: new Date(data.to),
    };

    const filters: EventFilters = data.filters ?? {};
    const offset = data.offset ?? 0;
    const fetchSize = RANKED_PAGE_SIZE + 1;

    if (data.dimension === "pages") {
      const rows = await queryTopPages(db, data.projectId, range, {
        limit: fetchSize,
        offset,
        filters,
      });
      return {
        items: rows.slice(0, RANKED_PAGE_SIZE).map((p) => ({
          label: p.path,
          count: p.views,
          filterValue: p.path,
        })),
        hasMore: rows.length > RANKED_PAGE_SIZE,
      };
    }

    if (data.dimension === "referrers") {
      const rows = await queryTopReferrers(db, data.projectId, range, {
        limit: fetchSize,
        offset,
        filters,
      });
      return {
        items: rows.slice(0, RANKED_PAGE_SIZE).map((r) => ({
          label: r.referrer,
          count: r.views,
          filterValue: r.referrer,
        })),
        hasMore: rows.length > RANKED_PAGE_SIZE,
      };
    }

    // dimension === "events"
    const rows = await queryEventCounts(db, data.projectId, range, {
      limit: fetchSize,
      offset,
      filters,
    });
    return {
      items: rows.slice(0, RANKED_PAGE_SIZE).map((e) => ({
        label: e.name,
        count: e.count,
        badge: e.type,
        filterValue: e.name,
      })),
      hasMore: rows.length > RANKED_PAGE_SIZE,
    };
  });

// ── Sessions list ─────────────────────────────────────────────────────────────

interface SessionsInput {
  projectId: string;
  from: string;
  to: string;
  offset?: number;
}

export interface SessionsData {
  sessions: SessionSummary[];
  offset: number;
  hasMore: boolean;
}

const PAGE_SIZE = 50;

export const getSessionsFn = createServerFn({ method: "GET" })
  .validator((data: SessionsInput) => data)
  .handler(async ({ data }): Promise<SessionsData> => {
    const session = await requireSession();
    await requireOwnedProject(db, data.projectId, session.user.id);

    const range: DateRange = {
      from: new Date(data.from),
      to: new Date(data.to),
    };
    const offset = data.offset ?? 0;

    // Fetch one extra to detect whether more pages exist.
    const rows = await querySessions(db, data.projectId, range, {
      limit: PAGE_SIZE + 1,
      offset,
    });

    const hasMore = rows.length > PAGE_SIZE;
    return {
      sessions: hasMore ? rows.slice(0, PAGE_SIZE) : rows,
      offset,
      hasMore,
    };
  });

// ── Session timeline ──────────────────────────────────────────────────────────

interface TimelineInput {
  projectId: string;
  sessionId: string;
}

export type { SessionSummary, SessionEvent };

export const getSessionTimelineFn = createServerFn({ method: "GET" })
  .validator((data: TimelineInput) => data)
  .handler(async ({ data }): Promise<SessionEvent[]> => {
    const session = await requireSession();
    await requireOwnedProject(db, data.projectId, session.user.id);
    return querySessionTimeline(db, data.projectId, data.sessionId);
  });

// ── Events list ───────────────────────────────────────────────────────────────

export interface EventsRow {
  name: string;
  type: string;
  count: number;
  sharePct: number;
  /** How the event fires: `spoor("name", …)` for custom, null for click. */
  trigger: string | null;
}

export interface EventsData {
  summary: { fired: number; clicks: number; custom: number; types: number };
  /** All click/custom event rows in range, ranked desc by count (cap 100). */
  rows: EventsRow[];
}

interface EventsInput {
  projectId: string;
  from: string;
  to: string;
}

export const getEventsFn = createServerFn({ method: "GET" })
  .validator((data: EventsInput) => data)
  .handler(async ({ data }): Promise<EventsData> => {
    const session = await requireSession();
    await requireOwnedProject(db, data.projectId, session.user.id);

    const range: DateRange = { from: new Date(data.from), to: new Date(data.to) };

    const rows = await queryEventCounts(db, data.projectId, range, { limit: 100 });

    const fired = rows.reduce((sum, r) => sum + r.count, 0);
    const clicks = rows
      .filter((r) => r.type === "click")
      .reduce((sum, r) => sum + r.count, 0);
    const custom = rows
      .filter((r) => r.type === "custom")
      .reduce((sum, r) => sum + r.count, 0);

    return {
      summary: { fired, clicks, custom, types: rows.length },
      rows: rows.map((r) => ({
        name: r.name,
        type: r.type,
        count: r.count,
        sharePct: fired > 0 ? Math.round((r.count / fired) * 100) : 0,
        trigger: r.type === "custom" ? `spoor("${r.name}", …)` : null,
      })),
    };
  });

// ── Event property breakdown ──────────────────────────────────────────────────

export interface EventBreakdown {
  prop: string;
  dist: Array<{ value: string; pct: number }>;
}

interface EventBreakdownInput {
  projectId: string;
  from: string;
  to: string;
  name: string;
}

export const getEventBreakdownFn = createServerFn({ method: "GET" })
  .validator((data: EventBreakdownInput) => data)
  .handler(async ({ data }): Promise<EventBreakdown | null> => {
    const session = await requireSession();
    await requireOwnedProject(db, data.projectId, session.user.id);
    const range: DateRange = { from: new Date(data.from), to: new Date(data.to) };
    return queryEventPropBreakdown(db, data.projectId, range, data.name);
  });
