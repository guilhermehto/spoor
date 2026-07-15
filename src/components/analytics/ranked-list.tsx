/**
 * RankedList — a ranked table card for top pages, referrers, or events.
 *
 * Props are additive/optional so existing callers (index.tsx) compile unchanged:
 * - `onSelect`  — when provided, rows render as buttons; clicking calls onSelect(row).
 * - `hasMore` + pagination props — when all supplied, a "Show more" button appends
 *   the next page via getRankedListFn (mirrors the Sessions "Load more" pattern).
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import {
  getRankedListFn,
  type RankedRow,
} from "~/server/analytics-fns";
import { type EventFilters } from "~/lib/event-filters";

// ── Types ─────────────────────────────────────────────────────────────────────

type RankedDimension = "pages" | "referrers" | "events";

/** Pagination context required to fetch subsequent pages. */
interface PaginationProps {
  projectId: string;
  from: string;
  to: string;
  filters?: EventFilters;
  dimension: RankedDimension;
}

interface RankedListProps {
  title: string;
  /** Accepts RankedRow[] (superset of the old RankedItem shape). */
  items: RankedRow[];
  emptyMessage?: string;
  countLabel?: string;
  /** Left-column header; defaults to "Path / Source" for page/referrer lists. */
  labelHeader?: string;
  /** When true, a "Show more" button is rendered (requires pagination props). */
  hasMore?: boolean;
  /** Called when a row is clicked; when absent rows are non-interactive. */
  onSelect?: (row: RankedRow) => void;
  /** Required alongside hasMore to enable pagination. */
  pagination?: PaginationProps;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RankedList({
  title,
  items: initialItems,
  emptyMessage = "No data for this period.",
  countLabel = "Views",
  labelHeader = "Path / Source",
  hasMore: initialHasMore = false,
  onSelect,
  pagination,
}: RankedListProps) {
  const [items, setItems] = useState<RankedRow[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);

  const max = items[0]?.count ?? 1;

  const canPaginate = hasMore && pagination != null;

  async function loadMore() {
    if (!pagination) return;
    setLoadingMore(true);
    try {
      const next = await getRankedListFn({
        data: {
          projectId: pagination.projectId,
          from: pagination.from,
          to: pagination.to,
          ...(pagination.filters !== undefined && { filters: pagination.filters }),
          dimension: pagination.dimension,
          offset: items.length,
        },
      });
      setItems((prev) => [...prev, ...next.items]);
      setHasMore(next.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

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
              <span>{labelHeader}</span>
              <span>{countLabel}</span>
            </div>
            {items.map((item, i) => {
              const inner = (
                <>
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
                </>
              );

              if (onSelect) {
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onSelect(item)}
                    className="w-full space-y-0.5 text-left rounded px-1 -mx-1 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={item.label}
                  >
                    {inner}
                  </button>
                );
              }

              return (
                <div key={i} className="space-y-0.5">
                  {inner}
                </div>
              );
            })}
            {canPaginate && (
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading…" : "Show more"}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
