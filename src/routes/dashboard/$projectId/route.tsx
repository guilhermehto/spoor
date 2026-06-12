import { createFileRoute, Outlet, notFound } from "@tanstack/react-router";
import { getProjectFn } from "~/server/projects";

export const Route = createFileRoute("/dashboard/$projectId")({
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
  return <Outlet />;
}
