/**
 * Sessions list + journey timeline view.
 *
 * URL: /dashboard/$projectId/sessions
 *
 * Reads `from`/`to` from the shared parent search params (set by the date-range
 * picker in route.tsx).  Clicking a session row expands its ordered event
 * timeline inline.  "Load more" fetches the next page of 50 sessions.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  getSessionsFn,
  getSessionTimelineFn,
  type SessionSummary,
  type SessionEvent,
} from "~/server/analytics-fns";
import { buildRange } from "~/components/analytics/range-picker";
import { SessionTimeline } from "~/components/analytics/session-timeline";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/$projectId/sessions")({
  loaderDeps: ({
    search,
  }: {
    search: { from?: string | undefined; to?: string | undefined };
  }) => {
    const defaultRange = buildRange("7d");
    return {
      from: search.from ?? defaultRange.from,
      to: search.to ?? defaultRange.to,
    };
  },
  loader: async ({ params, deps }) => {
    return getSessionsFn({
      data: {
        projectId: params.projectId,
        from: deps.from,
        to: deps.to,
        offset: 0,
      },
    });
  },
  component: SessionsPage,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function formatStartTime(date: Date): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

// ── Session row ───────────────────────────────────────────────────────────────

interface SessionRowProps {
  session: SessionSummary;
  projectId: string;
  isExpanded: boolean;
  onToggle: () => void;
}

function SessionRow({ session, projectId, isExpanded, onToggle }: SessionRowProps) {
  const [events, setEvents] = useState<SessionEvent[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    onToggle();
    if (!isExpanded && events === null) {
      setLoading(true);
      try {
        const timeline = await getSessionTimelineFn({
          data: { projectId, sessionId: session.sessionId },
        });
        setEvents(timeline as SessionEvent[]);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="border-b border-border last:border-0">
      {/* Summary row — clickable */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`text-xs transition-transform ${isExpanded ? "rotate-90" : ""}`}
              aria-hidden
            >
              ▶
            </span>
            <span
              className="truncate text-sm font-medium text-foreground"
              title={session.entryPath}
            >
              {session.entryPath || "/"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground tabular-nums">
            <span title="Session start (UTC)">{formatStartTime(session.startedAt)}</span>
            <span title="Duration">{formatDuration(session.durationSeconds)}</span>
            <span title="Event count">
              {session.eventCount} {session.eventCount === 1 ? "event" : "events"}
            </span>
          </div>
        </div>
        {session.referrer && (
          <p className="mt-0.5 ml-5 truncate text-xs text-muted-foreground" title={session.referrer}>
            via {session.referrer}
          </p>
        )}
      </button>

      {/* Expanded timeline */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 bg-muted/30">
          {loading ? (
            <p className="text-sm text-muted-foreground py-2">Loading timeline…</p>
          ) : events !== null ? (
            <SessionTimeline events={events} />
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * Inner list component.  Keyed on `${from}|${to}` by the parent so React
 * remounts it (resetting all state) whenever the date range changes.
 * "Load more" appends within the current range without affecting the key.
 */
interface SessionsListProps {
  projectId: string;
  from: string;
  to: string;
  initialSessions: SessionSummary[];
  initialHasMore: boolean;
}

function SessionsList({ projectId, from, to, initialSessions, initialHasMore }: SessionsListProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>(initialSessions);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await getSessionsFn({
        data: {
          projectId,
          from,
          to,
          offset: sessions.length,
        },
      });
      setSessions((prev) => [...prev, ...next.sessions]);
      setHasMore(next.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  function toggleSession(sessionId: string) {
    setExpandedId((prev) => (prev === sessionId ? null : sessionId));
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Recent sessions
          {sessions.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({sessions.length}{hasMore ? "+" : ""} shown)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-0">
        {sessions.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            No sessions in this date range.
          </p>
        ) : (
          <>
            {sessions.map((s) => (
              <SessionRow
                key={s.sessionId}
                session={s}
                projectId={projectId}
                isExpanded={expandedId === s.sessionId}
                onToggle={() => toggleSession(s.sessionId)}
              />
            ))}
            {hasMore && (
              <div className="px-4 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SessionsPage() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch() as { from?: string; to?: string };
  const initialData = Route.useLoaderData();

  const { from: defaultFrom, to: defaultTo } = buildRange("7d");
  const from = search.from ?? defaultFrom;
  const to = search.to ?? defaultTo;

  return (
    <div className="space-y-4">
      {/* Key on the range so state resets (list + expanded row) when range changes. */}
      <SessionsList
        key={`${from}|${to}`}
        projectId={projectId}
        from={from}
        to={to}
        initialSessions={initialData.sessions}
        initialHasMore={initialData.hasMore}
      />
    </div>
  );
}
