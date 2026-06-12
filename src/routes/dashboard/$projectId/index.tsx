import { createFileRoute } from "@tanstack/react-router";
import { getOverviewFn, type OverviewData } from "~/server/analytics-fns";
import { buildRange } from "~/components/analytics/range-picker";
import { TrafficChart } from "~/components/analytics/traffic-chart";
import { RankedList } from "~/components/analytics/ranked-list";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

const defaultRange = buildRange("7d");

export const Route = createFileRoute("/dashboard/$projectId/")({
  loaderDeps: ({ search }: { search: { from?: string | undefined; to?: string | undefined } }) => ({
    from: search.from ?? defaultRange.from,
    to: search.to ?? defaultRange.to,
  }),
  loader: async ({ params, deps }): Promise<OverviewData> => {
    return getOverviewFn({
      data: {
        projectId: params.projectId,
        from: deps.from,
        to: deps.to,
      },
    });
  },
  component: OverviewPage,
});

function OverviewPage() {
  const data = Route.useLoaderData() as OverviewData;

  const totalViews = data.timeSeries.reduce((s: number, b: { views: number }) => s + b.views, 0);
  const totalVisitors = data.timeSeries.reduce((s: number, b: { visitors: number }) => s + b.visitors, 0);

  const topPagesItems = data.topPages.map((p: { path: string; views: number }) => ({
    label: p.path,
    count: p.views,
  }));

  const topReferrersItems = data.topReferrers.map((r: { referrer: string; views: number }) => ({
    label: r.referrer,
    count: r.views,
  }));

  const eventCountItems = data.eventCounts.map((e: { name: string; type: string; count: number }) => ({
    label: e.name,
    count: e.count,
    badge: e.type,
  }));

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Page views
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {totalViews.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unique visitors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {totalVisitors.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Time-series chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Traffic over time</CardTitle>
        </CardHeader>
        <CardContent>
          <TrafficChart data={data.timeSeries} />
        </CardContent>
      </Card>

      {/* Ranked cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <RankedList
          title="Top pages"
          items={topPagesItems}
          emptyMessage="No page views in this period."
          countLabel="Views"
        />
        <RankedList
          title="Top referrers"
          items={topReferrersItems}
          emptyMessage="No external referrers in this period."
          countLabel="Views"
        />
        <RankedList
          title="Events"
          items={eventCountItems}
          emptyMessage="No click or custom events in this period."
          countLabel="Count"
        />
      </div>
    </div>
  );
}
