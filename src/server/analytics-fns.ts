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
  type DateRange,
  type TimeSeriesBucket,
  type TopPage,
  type TopReferrer,
  type EventCount,
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
