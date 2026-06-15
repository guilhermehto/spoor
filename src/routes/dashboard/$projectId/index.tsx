import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { getOverviewFn, type OverviewData, type RankedRow } from "~/server/analytics-fns";
import { buildRange } from "~/components/analytics/range-picker";
import { TrafficChart } from "~/components/analytics/traffic-chart";
import { RankedList } from "~/components/analytics/ranked-list";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { hasEventFilter, serializeFilters, type EventFilters, EVENT_TYPES, type EventType } from "~/lib/event-filters";

export const Route = createFileRoute("/dashboard/$projectId/")({
  loaderDeps: ({
    search,
  }: {
    search: {
      from?: string | undefined;
      to?: string | undefined;
      path?: string | undefined;
      type?: string | undefined;
      name?: string | undefined;
    };
  }) => {
    const defaultRange = buildRange("7d");
    return {
      from: search.from ?? defaultRange.from,
      to: search.to ?? defaultRange.to,
      path: search.path,
      type: search.type,
      name: search.name,
    };
  },
  loader: async ({ params, deps }): Promise<OverviewData> => {
    return getOverviewFn({
      data: {
        projectId: params.projectId,
        from: deps.from,
        to: deps.to,
        ...(deps.path !== undefined && { path: deps.path }),
        ...(deps.type !== undefined && { type: deps.type }),
        ...(deps.name !== undefined && { name: deps.name }),
      },
    });
  },
  component: OverviewPage,
});

function OverviewPage() {
  const data = Route.useLoaderData() as OverviewData;
  const { projectId } = Route.useParams();
  const search = Route.useSearch() as {
    from?: string;
    to?: string;
    path?: string;
    type?: string;
    name?: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navigate = useNavigate() as any;

  const defaultRange = buildRange("7d");
  const from = search.from ?? defaultRange.from;
  const to = search.to ?? defaultRange.to;

  const filters: EventFilters = {};
  if (search.path !== undefined) filters.path = search.path;
  if (
    search.type !== undefined &&
    (EVENT_TYPES as readonly string[]).includes(search.type)
  ) {
    filters.type = search.type as EventType;
  }
  if (search.name !== undefined) filters.name = search.name;

  const eventMode = hasEventFilter(filters);

  const totalViews = data.timeSeries.reduce((s: number, b: { views: number }) => s + b.views, 0);
  // Use the range-wide distinct count so a visitor active in N buckets counts once.
  const totalVisitors = data.uniqueVisitors;

  const topPagesItems = data.topPages.items;
  const topReferrersItems = data.topReferrers.items;
  const eventCountItems = data.eventCounts.items;

  // Degenerate-list hiding: hide the list whose grouping dimension is pinned.
  const hideTopPages = search.path !== undefined;
  // Hide Events list only when name is set (type-only filter keeps it visible).
  const hideEvents = search.name !== undefined;

  const filterKey = serializeFilters(filters).toString();

  function selectPage(row: RankedRow) {
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        path: row.filterValue,
      }),
      replace: true,
    });
  }

  function selectEvent(row: RankedRow) {
    navigate({
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = { ...prev, type: row.badge };
        if (row.filterValue) {
          next["name"] = row.filterValue;
        }
        return next;
      },
      replace: true,
    });
  }

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {eventMode ? "Events" : "Page views"}
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
              {eventMode ? "Visitors who triggered them" : "Unique visitors"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {totalVisitors.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-3xl font-bold tabular-nums ${
                data.errorCount > 0 ? "text-destructive" : "text-foreground"
              }`}
            >
              {data.errorCount.toLocaleString()}
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
          <TrafficChart data={data.timeSeries} eventMode={eventMode} />
        </CardContent>
      </Card>

      {/* Ranked cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {!hideTopPages && (
          <RankedList
            key={`pages|${from}|${to}|${filterKey}`}
            title="Top pages"
            items={topPagesItems}
            emptyMessage="No page views in this period."
            countLabel="Views"
            hasMore={data.topPages.hasMore}
            onSelect={selectPage}
            pagination={{
              projectId,
              from,
              to,
              filters,
              dimension: "pages",
            }}
          />
        )}
        <RankedList
          key={`referrers|${from}|${to}|${filterKey}`}
          title="Top referrers"
          items={topReferrersItems}
          emptyMessage="No external referrers in this period."
          countLabel="Views"
          hasMore={data.topReferrers.hasMore}
          pagination={{
            projectId,
            from,
            to,
            filters,
            dimension: "referrers",
          }}
        />
        {!hideEvents && (
          <RankedList
            key={`events|${from}|${to}|${filterKey}`}
            title="Events"
            items={eventCountItems}
            emptyMessage="No click or custom events in this period."
            countLabel="Count"
            hasMore={data.eventCounts.hasMore}
            onSelect={selectEvent}
            pagination={{
              projectId,
              from,
              to,
              filters,
              dimension: "events",
            }}
          />
        )}
      </div>
    </div>
  );
}
