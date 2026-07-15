/**
 * Events view — ranked "All events" table with lazy per-event property breakdown.
 *
 * URL: /dashboard/$projectId/events
 *
 * Reads `from`/`to` from the shared parent search params (set by the topbar
 * range control).  Custom-event rows expand to a chooseable-key property
 * breakdown with drill-down; click rows have no trigger and no caret.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getEventsFn,
  getEventBreakdownFn,
  getEventPropKeysFn,
  type EventsData,
  type EventsRow,
  type EventPropBreakdown,
  type RankedRow,
} from "~/server/analytics-fns";
import { buildRange } from "~/components/analytics/range-picker";
import { RankedList } from "~/components/analytics/ranked-list";
import { Button } from "~/components/ui/button";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/$projectId/events")({
  head: () => ({ meta: [{ title: "Events · Spoor" }] }),
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
  projectId: string;
  from: string;
  to: string;
  onToggle: () => void;
}

function EventRow({
  row,
  rank,
  maxCount,
  expanded,
  projectId,
  from,
  to,
  onToggle,
}: EventRowProps) {
  const isCustom = row.type === "custom";
  const fillClass = isCustom ? "bg-secondary" : "bg-primary";

  // Per-row breakdown state — only touched once the row is expanded.
  // undefined keys = not yet loaded; empty array = event has no property data.
  const [keys, setKeys] = useState<string[] | undefined>(undefined);
  const [keysLoading, setKeysLoading] = useState(false);
  const [propKey, setPropKey] = useState("");
  const [drill, setDrill] = useState<Record<string, string>>({});
  const [cache, setCache] = useState<Record<string, EventPropBreakdown>>({});

  // Cache breakdowns by key + active drill filters (mirrors the old lazy feel).
  const cacheKey = `${propKey}|${JSON.stringify(drill)}`;
  const breakdown = cache[cacheKey];

  // First expand: load the available prop keys, default to tenant_id if present.
  useEffect(() => {
    if (!isCustom || !expanded || keys !== undefined || keysLoading) return;
    setKeysLoading(true);
    getEventPropKeysFn({ data: { projectId, from, to, name: row.name } })
      .then((k) => {
        setKeys(k);
        setPropKey(k.includes("tenant_id") ? "tenant_id" : (k[0] ?? ""));
      })
      .catch(() => setKeys([]))
      .finally(() => setKeysLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // (Re)load the breakdown whenever the chosen key or drill filters change.
  useEffect(() => {
    if (!propKey || cache[cacheKey] !== undefined) return;
    getEventBreakdownFn({
      data: { projectId, from, to, name: row.name, propKey, props: drill },
    })
      .then((res) => setCache((prev) => ({ ...prev, [cacheKey]: res })))
      .catch(() =>
        setCache((prev) => ({
          ...prev,
          [cacheKey]: { key: propKey, rows: [], hasMore: false },
        })),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propKey, cacheKey]);

  function selectValue(r: RankedRow) {
    if (r.filterValue == null) return;
    setDrill((d) => ({ ...d, [propKey]: r.filterValue! }));
  }

  function removeChip(k: string) {
    setDrill((d) => {
      const next = { ...d };
      delete next[k];
      return next;
    });
  }

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
        {isCustom ? (
          <span className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}>
            ▶
          </span>
        ) : null}
      </span>
    </div>
  );

  return (
    <div className="border-b border-border last:border-0">
      {isCustom ? (
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
          {keys === undefined ? (
            <p className="text-sm text-muted-foreground">Loading breakdown…</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No property data</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="eyebrow" htmlFor={`bk-${row.name}`}>
                  Break down by
                </label>
                <select
                  id={`bk-${row.name}`}
                  value={propKey}
                  onChange={(e) => setPropKey(e.target.value)}
                  className="border-2 border-border bg-background px-2 py-1 text-sm"
                >
                  {keys.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                {Object.entries(drill).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => removeChip(k)}
                    className="inline-flex items-center gap-1 border-2 border-border bg-secondary/15 px-2 py-0.5 text-xs font-medium text-secondary hover:bg-secondary/25"
                  >
                    {k}={v} <span aria-hidden>✕</span>
                  </button>
                ))}
              </div>
              {breakdown ? (
                <>
                  <RankedList
                    key={cacheKey}
                    title={propKey}
                    labelHeader="Value"
                    items={breakdown.rows}
                    countLabel="Events"
                    emptyMessage="No values for this segment."
                    onSelect={selectValue}
                  />
                  {breakdown.hasMore && (
                    <p className="text-xs text-muted-foreground">
                      Showing top 50 values.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Loading breakdown…</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

/**
 * Keyed on `${from}|${to}` by the parent so expand state + per-row breakdown
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

  const maxCount = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="bg-card border-2 border-border">
      <div className="flex items-center justify-between border-b-2 border-border px-4 py-3">
        <span className="eyebrow">All events</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Ranked by fires</span>
          <Button asChild variant="outline" size="sm">
            <a
              href={`/api/export?${new URLSearchParams({ projectId, kind: "events", from, to })}`}
            >
              Export CSV
            </a>
          </Button>
        </div>
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
            projectId={projectId}
            from={from}
            to={to}
            onToggle={() =>
              setExpanded((e) => (e === row.name ? null : row.name))
            }
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
