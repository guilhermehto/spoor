/**
 * Sessions list + journey timeline view.
 *
 * URL: /dashboard/$projectId/sessions
 *
 * Reads `from`/`to` from the shared parent search params (set by the topbar
 * range control).  Each session is an editorial bordered row; clicking expands
 * its journey timeline inline.  "Load more" fetches the next page of 50.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  getSessionsFn,
  getSessionTimelineFn,
  type SessionSummary,
  type SessionEvent,
} from "~/server/analytics-fns";
import {
  buildRange,
  detectPreset,
  type Preset,
} from "~/components/analytics/range-picker";
import { SessionTimeline } from "~/components/analytics/session-timeline";
import { Button } from "~/components/ui/button";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/$projectId/sessions")({
  head: () => ({ meta: [{ title: "Sessions · Spoor" }] }),
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

const PRESET_LABELS: Record<Preset, string> = {
  today: "Today",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  custom: "Custom range",
};

function rangeLabel(from: string, to: string): string {
  const preset = detectPreset(from, to);
  if (preset !== "custom") return PRESET_LABELS[preset];
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };
  return `${new Date(from).toLocaleDateString("en-US", opts)} – ${new Date(to).toLocaleDateString("en-US", opts)}`;
}

// ponytail: display id derived from sessionId (SessionSummary has no visitorHash).
function shortId(sessionId: string): string {
  return `${sessionId.slice(0, 4)}··${sessionId.slice(-2)}`;
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
    <div className="bg-card border-2 border-border">
      {/* Summary row — clickable */}
      <button
        type="button"
        onClick={handleToggle}
        className="grid w-full grid-cols-[9px_auto_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto_auto] items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="h-[9px] w-[9px] rounded-full bg-primary" aria-hidden />
        <span className="font-mono text-xs tracking-wide text-foreground" title={session.sessionId}>
          {shortId(session.sessionId)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground" title={session.entryPath}>
            {session.entryPath || "/"}
          </span>
          <span className="block text-[11px] text-muted-foreground">entry page</span>
        </span>
        <span
          className="min-w-0 truncate text-xs text-muted-foreground"
          title={session.referrer || "direct"}
        >
          {session.referrer || "direct"}
        </span>
        <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
          {session.pageviewCount} pages · {session.interactionCount} ev
        </span>
        <span className="whitespace-nowrap text-sm text-foreground tabular-nums">
          {formatDuration(session.durationSeconds)}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      {/* Expanded timeline */}
      {isExpanded && (
        <div className="border-t-2 border-border px-4 py-4">
          {loading ? (
            <p className="py-2 text-sm text-muted-foreground">Loading timeline…</p>
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
    <div className="flex flex-col gap-[18px]">
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm text-foreground">
          <span className="font-bold tabular-nums">
            {sessions.length}
            {hasMore ? "+" : ""}
          </span>{" "}
          sessions ·{" "}
          <span className="text-muted-foreground">{rangeLabel(from, to)}</span>
        </h2>
        <p className="shrink-0 text-xs text-muted-foreground">
          Click a row to expand the visitor’s journey
        </p>
      </header>

      {sessions.length === 0 ? (
        <div className="bg-card border-2 border-border px-4 py-6 text-sm text-muted-foreground">
          No sessions in this date range.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
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
            <div>
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
        </div>
      )}
    </div>
  );
}

function SessionsPage() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch() as { from?: string; to?: string };
  const initialData = Route.useLoaderData();

  const { from: defaultFrom, to: defaultTo } = buildRange("7d");
  const from = search.from ?? defaultFrom;
  const to = search.to ?? defaultTo;

  // Key on the range so state resets (list + expanded row) when range changes.
  return (
    <SessionsList
      key={`${from}|${to}`}
      projectId={projectId}
      from={from}
      to={to}
      initialSessions={initialData.sessions}
      initialHasMore={initialData.hasMore}
    />
  );
}
