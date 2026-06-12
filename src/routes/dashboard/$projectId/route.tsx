import { createFileRoute, Link, Outlet, notFound } from "@tanstack/react-router";
import { getProjectFn } from "~/server/projects";
import { buildRange, RangePicker } from "~/components/analytics/range-picker";
import { Button } from "~/components/ui/button";

// ── Search params ─────────────────────────────────────────────────────────────

interface ProjectSearch {
  from: string | undefined;
  to: string | undefined;
}

function validateSearch(search: Record<string, unknown>): ProjectSearch {
  return {
    from: typeof search["from"] === "string" ? search["from"] : undefined,
    to: typeof search["to"] === "string" ? search["to"] : undefined,
  };
}

const defaultRange = buildRange("7d");

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

  const from = search.from ?? defaultRange.from;
  const to = search.to ?? defaultRange.to;

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
              search={{ from, to }}
              activeProps={{ className: "font-semibold" }}
            >
              Overview
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

      <Outlet />
    </div>
  );
}
