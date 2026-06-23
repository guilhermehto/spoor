/**
 * TrafficChart — editorial two-line chart of page views & unique visitors over time.
 *
 * Page views = primary (orange) line, width 3, with a filled end-dot.
 * Visitors   = secondary (ink) line, width ~1.5, no dots.
 * No filled areas; minimal horizontal gridlines; muted axis ticks.
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import type { TimeSeriesBucket } from "~/server/analytics";

interface TrafficChartProps {
  data: TimeSeriesBucket[];
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

export function TrafficChart({ data }: TrafficChartProps) {
  const isEmpty = data.every((b) => b.views === 0 && b.visitors === 0);

  if (isEmpty) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No page views in this period.
      </div>
    );
  }

  const chartData = data.map((b) => ({
    label: formatBucketLabel(b.bucket),
    "Page views": b.views,
    Visitors: b.visitors,
  }));
  const last = chartData[chartData.length - 1]!;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={chartData} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid
          vertical={false}
          stroke="var(--color-border)"
          strokeOpacity={0.15}
        />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 0,
            border: "2px solid var(--color-border)",
            background: "var(--color-card)",
            color: "var(--color-foreground)",
          }}
          cursor={{ stroke: "var(--color-border)", strokeOpacity: 0.3 }}
        />
        <Line
          type="monotone"
          dataKey="Page views"
          stroke="var(--color-primary)"
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 4, fill: "var(--color-primary)", stroke: "var(--color-card)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="Visitors"
          stroke="var(--color-secondary)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <ReferenceDot
          x={last.label}
          y={last["Page views"]}
          r={3.2}
          fill="var(--color-primary)"
          stroke="var(--color-card)"
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
