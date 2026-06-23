/**
 * Events view — ranked "All events" table with lazy per-event property breakdown.
 *
 * URL: /dashboard/$projectId/events
 *
 * Reads `from`/`to` from the shared parent search params (set by the topbar
 * range control).  Custom-event rows expand to lazily load + cache their
 * top-property distribution; click rows have no trigger and no caret.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  getEventsFn,
  getEventBreakdownFn,
  type EventsData,
  type EventsRow,
  type EventBreakdown,
} from "~/server/analytics-fns";
import { buildRange } from "~/components/analytics/range-picker";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/$projectId/events")({
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
    return getEventsFn({
      data: { projectId: params.projectId, from: deps.from, to: deps.to },
    });
  },
  component: EventsPage,
});

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="bg-card border-2 border-border p-4 flex flex-col gap-2">
      <span className="eyebrow">{label}</span>
      <span className="text-[32px] font-bold tabular-nums tracking-[-0.015em] leading-none">
        {value.toLocaleString()}
      </span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ── Type badge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const isCustom = type === "custom";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] ${
        isCustom
          ? "bg-secondary/15 text-secondary border-2 border-transparent"
          : "bg-muted text-muted-foreground border-2 border-border"
      }`}
    >
      {type}
    </span>
  );
}

// ── Event row ─────────────────────────────────────────────────────────────────

interface EventRowProps {
  row: EventsRow;
  rank: number;
  maxCount: number;
  expanded: boolean;
  breakdown: EventBreakdown | null | undefined; // undefined = not loaded, null = no data
  loading: boolean;
  onToggle: () => void;
}

function EventRow({
  row,
  rank,
  maxCount,
  expanded,
  breakdown,
  loading,
  onToggle,
}: EventRowProps) {
  const isCustom = row.type === "custom";
  // Custom rows are expandable until they resolve to "no property data".
  const expandable = isCustom && breakdown !== null;
  const fillClass = isCustom ? "bg-secondary" : "bg-primary";

  const inner = (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">
        {String(rank).padStart(2, "0")}
      </span>
      <TypeBadge type={row.type} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground" title={row.name}>
          {row.name}
        </div>
        {row.trigger && (
          <div className="truncate font-mono text-muted-foreground text-[11px]">
            {row.trigger}
          </div>
        )}
      </div>
      <div className="hidden h-1 w-28 shrink-0 bg-muted sm:block">
        <div
          className={`h-full ${fillClass}`}
          style={{ width: `${(row.count / maxCount) * 100}%` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-sm tabular-nums text-foreground">
        {row.count.toLocaleString()}
      </span>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {row.sharePct}%
      </span>
      <span className="w-4 shrink-0 text-center text-xs text-muted-foreground" aria-hidden>
        {expandable ? (
          <span className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}>
            ▶
          </span>
        ) : null}
      </span>
    </div>
  );

  return (
    <div className="border-b border-border last:border-0">
      {expandable ? (
        <button
          type="button"
          onClick={onToggle}
          className="block w-full text-left hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {inner}
        </button>
      ) : (
        inner
      )}

      {expanded && (
        <div className="border-t-2 border-border bg-muted/30 px-4 py-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading breakdown…</p>
          ) : breakdown ? (
            <>
              <div className="eyebrow mb-2">{breakdown.prop} breakdown</div>
              <div className="flex flex-col gap-1">
                {breakdown.dist.map((d) => (
                  <div key={d.value} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-sm" title={d.value}>
                      {d.value}
                    </span>
                    <div className="h-1 flex-1 bg-muted">
                      <div className="h-full bg-secondary" style={{ width: `${d.pct}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {d.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No property data</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

/**
 * Keyed on `${from}|${to}` by the parent so expand state + breakdown cache
 * reset whenever the date range changes.
 */
function EventsTable({
  projectId,
  from,
  to,
  rows,
}: {
  projectId: string;
  from: string;
  to: string;
  rows: EventsRow[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, EventBreakdown | null>>({});
  const [loadingName, setLoadingName] = useState<string | null>(null);

  const maxCount = Math.max(1, ...rows.map((r) => r.count));

  async function toggle(name: string) {
    if (expanded === name) {
      setExpanded(null);
      return;
    }
    setExpanded(name);
    // Fire the breakdown call once per event, then serve from cache.
    if (cache[name] === undefined && loadingName !== name) {
      setLoadingName(name);
      try {
        const res = await getEventBreakdownFn({
          data: { projectId, from, to, name },
        });
        setCache((prev) => ({ ...prev, [name]: res ?? null }));
      } finally {
        setLoadingName(null);
      }
    }
  }

  return (
    <div className="bg-card border-2 border-border">
      <div className="flex items-center justify-between border-b-2 border-border px-4 py-3">
        <span className="eyebrow">All events</span>
        <span className="text-xs text-muted-foreground">Ranked by fires</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          No events in this date range.
        </p>
      ) : (
        rows.map((row, i) => (
          <EventRow
            key={row.name}
            row={row}
            rank={i + 1}
            maxCount={maxCount}
            expanded={expanded === row.name}
            breakdown={cache[row.name]}
            loading={loadingName === row.name}
            onToggle={() => toggle(row.name)}
          />
        ))
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function EventsPage() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch() as { from?: string; to?: string };
  const data = Route.useLoaderData() as EventsData;

  const { from: defaultFrom, to: defaultTo } = buildRange("7d");
  const from = search.from ?? defaultFrom;
  const to = search.to ?? defaultTo;

  const { summary } = data;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid grid-cols-2 gap-[18px] sm:grid-cols-4">
        <SummaryCard
          label="Events fired"
          value={summary.fired}
          sub={`across ${summary.types} event ${summary.types === 1 ? "type" : "types"}`}
        />
        <SummaryCard
          label="Click events"
          value={summary.clicks}
          sub={`${summary.fired > 0 ? Math.round((summary.clicks / summary.fired) * 100) : 0}% of all fires`}
        />
        <SummaryCard
          label="Custom events"
          value={summary.custom}
          sub={`${summary.fired > 0 ? Math.round((summary.custom / summary.fired) * 100) : 0}% of all fires`}
        />
        <SummaryCard label="Event types" value={summary.types} />
      </div>

      {/* Key on range so expand state + breakdown cache reset when range changes. */}
      <EventsTable
        key={`${from}|${to}`}
        projectId={projectId}
        from={from}
        to={to}
        rows={data.rows}
      />
    </div>
  );
}
