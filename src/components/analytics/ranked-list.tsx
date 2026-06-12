/**
 * RankedList — a ranked table card for top pages, referrers, or events.
 */

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

interface RankedItem {
  label: string;
  count: number;
  badge?: string; // optional type badge (e.g. "click", "custom")
}

interface RankedListProps {
  title: string;
  items: RankedItem[];
  emptyMessage?: string;
  countLabel?: string;
}

export function RankedList({
  title,
  items,
  emptyMessage = "No data for this period.",
  countLabel = "Views",
}: RankedListProps) {
  const max = items[0]?.count ?? 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-muted-foreground mb-1">
              <span>Path / Source</span>
              <span>{countLabel}</span>
            </div>
            {items.map((item, i) => (
              <div key={i} className="space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {item.badge && (
                      <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {item.badge}
                      </span>
                    )}
                    <span
                      className="truncate text-sm text-foreground"
                      title={item.label}
                    >
                      {item.label}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                    {item.count.toLocaleString()}
                  </span>
                </div>
                {/* progress bar */}
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground/20"
                    style={{ width: `${Math.round((item.count / max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
