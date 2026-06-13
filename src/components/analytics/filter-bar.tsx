/**
 * FilterBar — Overview-only filter controls.
 *
 * Renders only when the current route matches the Overview index
 * (`/dashboard/$projectId/`).  Provides:
 *   - A segmented Button group for event type (pageview / click / custom)
 *   - Removable Badge chips for active `path` and `name` filters
 *
 * Navigates with the `(prev) => ({ ...prev, key })` updater so `from`/`to`
 * and other filters are always preserved.
 */

import { useNavigate, useMatchRoute } from "@tanstack/react-router";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { EVENT_TYPES, type EventType } from "~/lib/event-filters";

interface FilterBarProps {
  path?: string | undefined;
  type?: EventType | undefined;
  name?: string | undefined;
  projectId: string;
}

const TYPE_LABELS: Record<EventType, string> = {
  pageview: "Pageview",
  click: "Click",
  custom: "Custom",
};

export function FilterBar({ path, type, name, projectId }: FilterBarProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navigate = useNavigate() as any;
  const matchRoute = useMatchRoute();

  const isOverview = Boolean(
    matchRoute({ to: "/dashboard/$projectId", params: { projectId } }),
  );

  if (!isOverview) return null;

  function setType(next: EventType | undefined) {
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        type: next,
      }),
      replace: true,
    });
  }

  function removePath() {
    navigate({
      search: (prev: Record<string, unknown>) => {
        const { path: _p, ...rest } = prev as Record<string, unknown> & {
          path?: unknown;
        };
        void _p;
        return rest;
      },
      replace: true,
    });
  }

  function removeName() {
    navigate({
      search: (prev: Record<string, unknown>) => {
        const { name: _n, ...rest } = prev as Record<string, unknown> & {
          name?: unknown;
        };
        void _n;
        return rest;
      },
      replace: true,
    });
  }

  const hasActiveFilters = path !== undefined || type !== undefined || name !== undefined;

  if (!hasActiveFilters) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Event-type segmented control */}
      {EVENT_TYPES.map((t) => (
        <Button
          key={t}
          variant={type === t ? "default" : "outline"}
          size="sm"
          onClick={() => setType(type === t ? undefined : t)}
        >
          {TYPE_LABELS[t]}
        </Button>
      ))}

      {/* Active filter chips */}
      {path !== undefined && (
        <Badge variant="secondary" className="gap-1 cursor-default">
          path: {path}
          <button
            type="button"
            aria-label={`Remove path filter: ${path}`}
            className="ml-1 rounded-full hover:bg-secondary-foreground/20 focus:outline-none"
            onClick={removePath}
          >
            ×
          </button>
        </Badge>
      )}
      {name !== undefined && (
        <Badge variant="secondary" className="gap-1 cursor-default">
          name: {name}
          <button
            type="button"
            aria-label={`Remove name filter: ${name}`}
            className="ml-1 rounded-full hover:bg-secondary-foreground/20 focus:outline-none"
            onClick={removeName}
          >
            ×
          </button>
        </Badge>
      )}
    </div>
  );
}
