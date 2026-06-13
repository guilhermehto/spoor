import { createFileRoute, Link, Outlet, notFound } from "@tanstack/react-router";
import { getProjectFn } from "~/server/projects";
import { buildRange, RangePicker } from "~/components/analytics/range-picker";
import { FilterBar } from "~/components/analytics/filter-bar";
import { Button } from "~/components/ui/button";
import { EVENT_TYPES } from "~/lib/event-filters";
import type { EventType } from "~/lib/event-filters";

// ── Search params ─────────────────────────────────────────────────────────────

interface ProjectSearch {
  from: string | undefined;
  to: string | undefined;
  path?: string;
  type?: EventType;
  name?: string;
}

function validateSearch(search: Record<string, unknown>): ProjectSearch {
  const rawType = search["type"];
  const type =
    typeof rawType === "string" &&
    (EVENT_TYPES as readonly string[]).includes(rawType)
      ? (rawType as EventType)
      : undefined;

  const result: ProjectSearch = {
    from: typeof search["from"] === "string" ? search["from"] : undefined,
    to: typeof search["to"] === "string" ? search["to"] : undefined,
  };
  if (typeof search["path"] === "string") result.path = search["path"];
  if (type !== undefined) result.type = type;
  if (typeof search["name"] === "string") result.name = search["name"];
  return result;
}

export const Route = createFileRoute("/dashboard/$projectId")({
  validateSearch,
  beforeLoad: async ({ params }) => {
    const project = await getProjectFn({ data: { projectId: params.projectId } });
    if (!project) {
      throw notFound();
    }
    return { project };
  },
  component: ProjectLayout,
  notFoundComponent: () => (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold text-foreground">Project not found</h1>
      <p className="text-sm text-muted-foreground">
        This project does not exist or you do not have access to it.
      </p>
    </div>
  ),
});

function ProjectLayout() {
  const { project } = Route.useRouteContext();
  const search = Route.useSearch();

  const defaultRange = buildRange("7d");
  const from = search.from ?? defaultRange.from;
  const to = search.to ?? defaultRange.to;
  const { path, type, name } = search;

  return (
    <div className="space-y-6">
      {/* Project header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard">← Projects</Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">{project.name}</h1>
          </div>
        </div>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link
              to="/dashboard/$projectId"
              params={{ projectId: project.id }}
              search={(prev) => ({ ...prev, from, to })}
              activeProps={{ className: "font-semibold" }}
            >
              Overview
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link
              to="/dashboard/$projectId/sessions"
              params={{ projectId: project.id }}
              search={{ from, to }}
              activeProps={{ className: "font-semibold" }}
            >
              Sessions
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link
              to="/dashboard/$projectId/setup"
              params={{ projectId: project.id }}
              search={{ from, to }}
            >
              Setup
            </Link>
          </Button>
        </nav>
      </div>

      {/* Date range picker — shared across all child routes */}
      <RangePicker from={from} to={to} />

      {/* Filter bar — Overview-only; mounts itself only on the index route */}
      <FilterBar
        path={path}
        type={type}
        name={name}
        projectId={project.id}
      />

      <Outlet />
    </div>
  );
}
