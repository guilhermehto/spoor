/**
 * SessionTimeline — ordered event list for a single session.
 *
 * Each event shows a type icon, name/path, and relative timestamp offset from
 * session start.  Works for sessions with a single pageview.
 */

import type { SessionEvent } from "~/server/analytics-fns";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatOffset(ms: number): string {
  if (ms < 1000) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatAbsoluteTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

// ── Type icon ─────────────────────────────────────────────────────────────────

function TypeIcon({ type }: { type: string }) {
  if (type === "pageview") {
    return (
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold"
        title="Pageview"
      >
        P
      </span>
    );
  }
  if (type === "click") {
    return (
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-bold"
        title="Click"
      >
        C
      </span>
    );
  }
  if (type === "error") {
    return (
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 text-xs font-bold"
        title="Error"
      >
        !
      </span>
    );
  }
  // custom
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-xs font-bold"
      title="Custom event"
    >
      E
    </span>
  );
}

// ── Event row ─────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: SessionEvent }) {
  const isError = event.type === "error";
  const label =
    event.type === "pageview"
      ? event.path || "(unknown path)"
      : event.name || event.path || "(unnamed)";

  const errorSource =
    isError && event.props && typeof event.props["source"] === "string"
      ? event.props["source"]
      : null;
  const errorLine =
    isError && event.props && typeof event.props["line"] === "number"
      ? event.props["line"]
      : null;

  return (
    <li className="flex items-start gap-3 py-2">
      {/* connector line + icon */}
      <div className="flex flex-col items-center">
        <TypeIcon type={event.type} />
      </div>

      {/* content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`truncate text-sm font-medium ${isError ? "text-destructive" : "text-foreground"}`}
            title={label}
          >
            {label}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            +{formatOffset(event.offsetMs)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
            {event.type}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatAbsoluteTime(new Date(event.createdAt))} UTC
          </span>
        </div>
        {errorSource && (
          <p
            className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
            title={errorSource}
          >
            {errorSource}
            {errorLine !== null ? `:${errorLine}` : ""}
          </p>
        )}
      </div>
    </li>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

interface SessionTimelineProps {
  events: SessionEvent[];
}

export function SessionTimeline({ events }: SessionTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No events recorded for this session.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {events.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </ul>
  );
}
