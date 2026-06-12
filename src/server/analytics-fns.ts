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
  queryTopPages,
  queryTopReferrers,
  queryEventCounts,
  querySessions,
  querySessionTimeline,
  type DateRange,
  type TimeSeriesBucket,
  type TopPage,
  type TopReferrer,
  type EventCount,
  type SessionSummary,
  type SessionEvent,
  type JsonValue,
} from "./analytics";

async function requireSession() {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

interface OverviewInput {
  projectId: string;
  from: string; // ISO string
  to: string;   // ISO string
}

export interface OverviewData {
  timeSeries: TimeSeriesBucket[];
  topPages: TopPage[];
  topReferrers: TopReferrer[];
  eventCounts: EventCount[];
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

    const [timeSeries, topPages, topReferrers, eventCounts] = await Promise.all([
      queryTimeSeries(db, data.projectId, range),
      queryTopPages(db, data.projectId, range),
      queryTopReferrers(db, data.projectId, range),
      queryEventCounts(db, data.projectId, range),
    ]);

    return { timeSeries, topPages, topReferrers, eventCounts };
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
