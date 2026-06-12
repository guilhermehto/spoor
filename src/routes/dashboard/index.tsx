import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { listProjectsFn, createProjectFn, deleteProjectFn } from "~/server/projects";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export const Route = createFileRoute("/dashboard/")({
  loader: () => listProjectsFn(),
  component: DashboardIndex,
});

function DashboardIndex() {
  const projects = Route.useLoaderData();
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await createProjectFn({ data: { name } });
      setName("");
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(projectId: string) {
    if (!confirm("Delete this project and all its data?")) return;
    try {
      await deleteProjectFn({ data: { projectId } });
      await router.invalidate();
    } catch {
      alert("Failed to delete project");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each project gets a unique tracking key for its snippet.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New project</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My website"
                required
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </form>
          {error && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No projects yet. Create one above to get started.
        </p>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="space-y-0.5">
                  <p className="font-medium text-foreground">{project.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {project.publicKey}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      to="/dashboard/$projectId/setup"
                      params={{ projectId: project.id }}
                    >
                      Setup
                    </Link>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(project.id)}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
