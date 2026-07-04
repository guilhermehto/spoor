import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  getOverviewFn,
  getActiveNowFn,
  getHasEventsFn,
  getDeviceBreakdownFn,
  getUtmBreakdownFn,
  type OverviewData,
  type DeviceBreakdownData,
  type UtmBreakdownData,
  type RankedRow,
} from "~/server/analytics-fns";
import { buildRange, detectPreset, type Preset } from "~/components/analytics/range-picker";
import { TrafficChart } from "~/components/analytics/traffic-chart";
import { Button } from "~/components/ui/button";

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
  loader: async ({ params, deps }) => {
    const input = { projectId: params.projectId, from: deps.from, to: deps.to };
    const [overview, devices, campaigns] = await Promise.all([
      getOverviewFn({ data: input }),
      getDeviceBreakdownFn({ data: input }),
      getUtmBreakdownFn({ data: input }),
    ]);
    return { overview, devices, campaigns };
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

function MetricCard({
  label,
  value,
  delta,
  current,
}: {
  label: string;
  value: string;
  /** Percent change vs. previous window; null = no baseline. */
  delta: number | null;
  /** Raw current value — decides "new" vs. "—" when delta is null. */
  current: number;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="bg-card border-2 border-border p-4 flex flex-col gap-2">
      <div className="eyebrow">{label}</div>
      <div className="metric text-foreground">{value}</div>
      <div className="text-xs">
        {delta === null ? (
          current > 0 ? (
            <span className="eyebrow bg-muted px-1.5 py-0.5 text-muted-foreground">new</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        ) : (
          <>
            <span className={up ? "text-primary" : "text-[var(--color-negative)]"}>
              {up ? "▲" : "▼"} {Math.abs(delta)}%
            </span>{" "}
            <span className="text-muted-foreground">vs. prev.</span>
          </>
        )}
      </div>
    </div>
  );
}

function ActiveNow({ projectId }: { projectId: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      getActiveNowFn({ data: { projectId } })
        .then((n) => {
          if (!cancelled) setCount(n);
        })
        .catch(() => {});
    };
    tick();
    // ponytail: 30s poll, websockets overkill
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectId]);

  if (count === null) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
      <span className="tabular-nums">{count.toLocaleString()}</span> active now
    </div>
  );
}

function OnboardingCallout({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [hasEvents, setHasEvents] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHasEventsFn({ data: { projectId } })
      .then((has) => {
        if (!cancelled) setHasEvents(has);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (hasEvents !== false) return;
    // ponytail: 5s poll while waiting for the first event; interval dies once it lands
    const id = setInterval(() => {
      getHasEventsFn({ data: { projectId } })
        .then((has) => {
          if (has) {
            setHasEvents(true);
            void router.invalidate();
          }
        })
        .catch(() => {});
    }, 5_000);
    return () => clearInterval(id);
  }, [hasEvents, projectId, router]);

  if (hasEvents !== false) return null;
  return (
    <div className="bg-card border-2 border-primary p-6 flex flex-col items-start gap-2">
      <div className="text-lg font-bold text-foreground">Waiting for your first event…</div>
      <p className="text-sm text-muted-foreground">
        Install the tracking snippet on your site — data appears here as soon as the first
        event arrives.
      </p>
      <Button size="sm" asChild>
        <Link
          to="/dashboard/$projectId/setup"
          params={{ projectId }}
          search={{ from: undefined, to: undefined }}
        >
          Get the snippet →
        </Link>
      </Button>
    </div>
  );
}

function BarPanel({
  title,
  items,
  fillClass,
  transformLabel,
  emptyMessage,
  action,
}: {
  title: string;
  items: RankedRow[];
  fillClass: string;
  transformLabel?: (label: string) => string;
  emptyMessage: string;
  /** Optional control rendered right of the title (e.g. dimension toggle). */
  action?: ReactNode;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="bg-card border-2 border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="eyebrow">{title}</div>
        {action}
      </div>
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

const DEVICE_DIMS = [
  ["browsers", "Browser"],
  ["os", "OS"],
  ["devices", "Device"],
] as const;

function DevicesPanel({ data }: { data: DeviceBreakdownData }) {
  // ponytail: client-side toggle over the one fetched payload — no refetch per dimension
  const [dim, setDim] = useState<(typeof DEVICE_DIMS)[number][0]>("browsers");
  return (
    <BarPanel
      title="Devices"
      items={data[dim]}
      fillClass="bg-primary"
      emptyMessage="No device data in this period."
      action={
        <div className="flex gap-1">
          {DEVICE_DIMS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDim(key)}
              className={`eyebrow px-1.5 py-0.5 ${
                dim === key ? "bg-muted text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    />
  );
}

const UTM_DIMS = [
  ["sources", "Source"],
  ["mediums", "Medium"],
  ["campaigns", "Campaign"],
] as const;

function CampaignsPanel({ data }: { data: UtmBreakdownData }) {
  // ponytail: client-side toggle over the one fetched payload — no refetch per dimension
  const [dim, setDim] = useState<(typeof UTM_DIMS)[number][0]>("sources");
  return (
    <BarPanel
      title="Campaigns"
      items={data[dim]}
      fillClass="bg-secondary"
      emptyMessage="No campaign traffic in this range."
      action={
        <div className="flex gap-1">
          {UTM_DIMS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDim(key)}
              className={`eyebrow px-1.5 py-0.5 ${
                dim === key ? "bg-muted text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    />
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function OverviewPage() {
  const { projectId } = Route.useParams();
  const { overview: data, devices, campaigns } = Route.useLoaderData() as {
    overview: OverviewData;
    devices: DeviceBreakdownData;
    campaigns: UtmBreakdownData;
  };
  const search = Route.useSearch() as { from?: string; to?: string };

  const defaultRange = buildRange("7d");
  const from = search.from ?? defaultRange.from;
  const to = search.to ?? defaultRange.to;
  const rangeLabel = RANGE_LABELS[detectPreset(from, to)];

  const { metrics } = data;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* First-event onboarding */}
      <OnboardingCallout projectId={projectId} />
      {/* Live indicator */}
      <ActiveNow projectId={projectId} />
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-[18px] sm:grid-cols-5">
        <MetricCard
          label="Page views"
          value={metrics.pageViews.toLocaleString()}
          delta={metrics.deltas.pageViews}
          current={metrics.pageViews}
        />
        <MetricCard
          label="Unique visitors"
          value={metrics.uniqueVisitors.toLocaleString()}
          delta={metrics.deltas.uniqueVisitors}
          current={metrics.uniqueVisitors}
        />
        <MetricCard
          label="Sessions"
          value={metrics.sessions.toLocaleString()}
          delta={metrics.deltas.sessions}
          current={metrics.sessions}
        />
        <MetricCard
          label="Avg. session"
          value={formatAvg(metrics.avgSessionSeconds)}
          delta={metrics.deltas.avgSessionSeconds}
          current={metrics.avgSessionSeconds}
        />
        <MetricCard
          label="Bounce rate"
          value={`${metrics.bounceRate}%`}
          delta={metrics.deltas.bounceRate}
          current={metrics.bounceRate}
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
        <DevicesPanel data={devices} />
        <CampaignsPanel data={campaigns} />
      </div>
    </div>
  );
}
