/**
 * SessionTimeline — editorial journey timeline for a single session.
 *
 * A vertical list with a left rail.  Each step shows its absolute time (+offset
 * from session start), a kind-colored dot on the rail, a kind badge + label,
 * and (custom events only) a props meta chip.  Works for single-pageview
 * sessions.
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

// Kind → editorial colors. Unknown kinds (e.g. error) fall to the negative token.
function dotBgClass(type: string): string {
  if (type === "pageview") return "bg-muted-foreground";
  if (type === "click") return "bg-primary";
  if (type === "custom") return "bg-secondary";
  return "bg-[var(--color-negative)]";
}

function textColorClass(type: string): string {
  if (type === "pageview") return "text-muted-foreground";
  if (type === "click") return "text-primary";
  if (type === "custom") return "text-secondary";
  return "text-[var(--color-negative)]";
}

// ── Timeline step ─────────────────────────────────────────────────────────────

function TimelineStep({ event, isLast }: { event: SessionEvent; isLast: boolean }) {
  const label =
    event.type === "pageview"
      ? event.path || "(unknown path)"
      : event.name || event.path || "(unnamed)";

  // Meta chip only for custom events (clicks capture no selector — DEFERRED).
  const meta =
    event.type === "custom" && event.props ? JSON.stringify(event.props) : null;

  return (
    <li className="grid grid-cols-[auto_16px_minmax(0,1fr)] gap-x-3">
      {/* time column */}
      <div className="pt-0.5 text-right">
        <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatAbsoluteTime(new Date(event.createdAt))}
        </div>
        <div className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
          +{formatOffset(event.offsetMs)}
        </div>
      </div>

      {/* rail + dot — connector runs from this dot down to the next */}
      <div className="relative flex justify-center">
        {!isLast && (
          <span aria-hidden className="absolute bottom-0 top-[14px] w-[2px] bg-border" />
        )}
        <span
          aria-hidden
          className={`relative mt-1 h-[9px] w-[9px] rounded-full ring-2 ring-[var(--color-card)] ${dotBgClass(event.type)}`}
        />
      </div>

      {/* label column */}
      <div className="min-w-0 pb-5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`shrink-0 border-2 border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${textColorClass(event.type)}`}
          >
            {event.type}
          </span>
          <span className="truncate text-sm font-medium text-foreground" title={label}>
            {label}
          </span>
        </div>
        {meta && (
          <p
            className="mt-1 truncate border-2 border-border bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground"
            title={meta}
          >
            {meta}
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
      <p className="py-2 text-sm text-muted-foreground">
        No events recorded for this session.
      </p>
    );
  }

  return (
    <ol className="flex flex-col">
      {events.map((event, i) => (
        <TimelineStep key={event.id} event={event} isLast={i === events.length - 1} />
      ))}
    </ol>
  );
}
