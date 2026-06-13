/**
 * TrafficChart — recharts area chart of page views (or events) and unique visitors over time.
 *
 * When `eventMode` is true the primary series is labelled "Events" and the
 * empty-state copy reflects that; the default ("Views") is unchanged.
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { TimeSeriesBucket } from "~/server/analytics";

interface TrafficChartProps {
  data: TimeSeriesBucket[];
  /** When true, relabels the primary series as "Events" (event-filter active). */
  eventMode?: boolean;
}

function formatBucketLabel(bucket: string): string {
  // Hour bucket: "2024-06-01T14:00:00Z" → "Jun 1 14:00"
  // Day bucket:  "2024-06-01"           → "Jun 1"
  if (bucket.includes("T")) {
    const d = new Date(bucket);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    });
  }
  const parts = bucket.split("-").map(Number);
  const d = new Date(Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!));
  return d.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function TrafficChart({ data, eventMode = false }: TrafficChartProps) {
  const isEmpty = data.every((b) => b.views === 0 && b.visitors === 0);

  if (isEmpty) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        {eventMode ? "No events in this period." : "No page views in this period."}
      </div>
    );
  }

  const primaryKey = eventMode ? "Events" : "Views";

  const chartData = data.map((b) => ({
    label: formatBucketLabel(b.bucket),
    [primaryKey]: b.views,
    Visitors: b.visitors,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(240 5.9% 10%)" stopOpacity={0.15} />
            <stop offset="95%" stopColor="hsl(240 5.9% 10%)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorVisitors" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(240 3.8% 46.1%)" stopOpacity={0.15} />
            <stop offset="95%" stopColor="hsl(240 3.8% 46.1%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 5.9% 90%)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 6,
            border: "1px solid hsl(240 5.9% 90%)",
            background: "hsl(0 0% 100%)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey={primaryKey}
          stroke="hsl(240 5.9% 10%)"
          strokeWidth={2}
          fill="url(#colorViews)"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="Visitors"
          stroke="hsl(240 3.8% 46.1%)"
          strokeWidth={2}
          fill="url(#colorVisitors)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
