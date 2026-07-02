import { createFileRoute } from "@tanstack/react-router";
import { getOverviewFn, type OverviewData, type RankedRow } from "~/server/analytics-fns";
import { buildRange, detectPreset, type Preset } from "~/components/analytics/range-picker";
import { TrafficChart } from "~/components/analytics/traffic-chart";

export const Route = createFileRoute("/dashboard/$projectId/")({
  head: () => ({ meta: [{ title: "Overview · Spoor" }] }),
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
  loader: async ({ params, deps }): Promise<OverviewData> => {
    return getOverviewFn({
      data: { projectId: params.projectId, from: deps.from, to: deps.to },
    });
  },
  component: OverviewPage,
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const RANGE_LABELS: Record<Preset, string> = {
  today: "Today",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  custom: "Custom range",
};

function formatAvg(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

/** Reduce a stored referrer string to its host (strip scheme/path; fall back to raw). */
function referrerHost(ref: string): string {
  try {
    return new URL(ref).host || ref;
  } catch {
    return ref.replace(/^[a-z]+:\/\//i, "").split("/")[0] || ref;
  }
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function MetricCard({ label, value, delta }: { label: string; value: string; delta: number }) {
  const up = delta >= 0;
  return (
    <div className="bg-card border-2 border-border p-4 flex flex-col gap-2">
      <div className="eyebrow">{label}</div>
      <div className="metric text-foreground">{value}</div>
      <div className="text-xs">
        <span className={up ? "text-primary" : "text-[var(--color-negative)]"}>
          {up ? "▲" : "▼"} {Math.abs(delta)}%
        </span>{" "}
        <span className="text-muted-foreground">vs. prev.</span>
      </div>
    </div>
  );
}

function BarPanel({
  title,
  items,
  fillClass,
  transformLabel,
  emptyMessage,
}: {
  title: string;
  items: RankedRow[];
  fillClass: string;
  transformLabel?: (label: string) => string;
  emptyMessage: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="bg-card border-2 border-border p-4">
      <div className="eyebrow mb-3">{title}</div>
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground">{emptyMessage}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((row, i) => (
            <div key={`${row.label}-${i}`}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-foreground">
                  {transformLabel ? transformLabel(row.label) : row.label}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {row.count.toLocaleString()}
                </span>
              </div>
              <div className="mt-1 h-1 bg-muted">
                <div
                  className={`h-full ${fillClass}`}
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventTypeBadge({ type }: { type?: string }) {
  const isCustom = type === "custom";
  const cls = isCustom
    ? "bg-secondary/15 text-secondary"
    : "bg-muted border-2 border-border text-muted-foreground";
  return <span className={`eyebrow px-1.5 py-0.5 ${cls}`}>{type ?? ""}</span>;
}

function EventsPanel({ items }: { items: RankedRow[] }) {
  return (
    <div className="bg-card border-2 border-border p-4">
      <div className="eyebrow mb-3">Events</div>
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground">No events in this period.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((row, i) => (
            <div key={`${row.label}-${i}`} className="flex items-center gap-2 text-sm">
              <EventTypeBadge type={row.badge ?? ""} />
              <span className="flex-1 truncate text-foreground">{row.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {row.count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function OverviewPage() {
  const data = Route.useLoaderData() as OverviewData;
  const search = Route.useSearch() as { from?: string; to?: string };

  const defaultRange = buildRange("7d");
  const from = search.from ?? defaultRange.from;
  const to = search.to ?? defaultRange.to;
  const rangeLabel = RANGE_LABELS[detectPreset(from, to)];

  const { metrics } = data;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-[18px] sm:grid-cols-5">
        <MetricCard
          label="Page views"
          value={metrics.pageViews.toLocaleString()}
          delta={metrics.deltas.pageViews}
        />
        <MetricCard
          label="Unique visitors"
          value={metrics.uniqueVisitors.toLocaleString()}
          delta={metrics.deltas.uniqueVisitors}
        />
        <MetricCard
          label="Sessions"
          value={metrics.sessions.toLocaleString()}
          delta={metrics.deltas.sessions}
        />
        <MetricCard
          label="Avg. session"
          value={formatAvg(metrics.avgSessionSeconds)}
          delta={metrics.deltas.avgSessionSeconds}
        />
        <MetricCard
          label="Bounce rate"
          value={`${metrics.bounceRate}%`}
          delta={metrics.deltas.bounceRate}
        />
      </div>

      {/* Traffic chart */}
      <div className="bg-card border-2 border-border p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Traffic over time</div>
            <div className="text-xs text-muted-foreground">{rangeLabel}</div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-4 bg-primary" /> Page views
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-4 bg-secondary" /> Visitors
            </span>
          </div>
        </div>
        <div className="mt-4">
          <TrafficChart data={data.timeSeries} />
        </div>
      </div>

      {/* Ranked panels */}
      <div className="grid gap-[18px] md:grid-cols-3">
        <BarPanel
          title="Top pages"
          items={data.topPages.items}
          fillClass="bg-primary"
          emptyMessage="No page views in this period."
        />
        <BarPanel
          title="Top referrers"
          items={data.topReferrers.items}
          fillClass="bg-secondary"
          transformLabel={referrerHost}
          emptyMessage="No external referrers in this period."
        />
        <EventsPanel items={data.eventCounts.items} />
      </div>
    </div>
  );
}
