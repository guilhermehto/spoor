/**
 * createServerFn wrappers for the analytics query layer.
 *
 * Each function verifies session ownership before delegating to the pure
 * query functions in analytics.ts.  Callers (loaders) import from here.
 */

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { auth } from "~/lib/auth";
import { db } from "~/db/index";
import {
  requireOwnedProject,
  queryTimeSeries,
  queryUniqueVisitors,
  queryTopPages,
  queryTopReferrers,
  queryEventCounts,
  querySessions,
  querySessionTimeline,
  type DateRange,
  type TimeSeriesBucket,
  type SessionSummary,
  type SessionEvent,
  type JsonValue,
} from "./analytics";
import { type EventFilters } from "~/lib/event-filters";

async function requireSession() {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

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
  topPages: RankedPage;
  topReferrers: RankedPage;
  eventCounts: RankedPage;
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

    const [timeSeries, uniqueVisitors, rawPages, rawReferrers, rawEvents] = await Promise.all([
      queryTimeSeries(db, data.projectId, range, filters),
      queryUniqueVisitors(db, data.projectId, range, filters),
      queryTopPages(db, data.projectId, range, { limit: fetchSize, filters }),
      queryTopReferrers(db, data.projectId, range, { limit: fetchSize, filters }),
      queryEventCounts(db, data.projectId, range, { limit: fetchSize, filters }),
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

    return { timeSeries, uniqueVisitors, topPages, topReferrers, eventCounts };
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
