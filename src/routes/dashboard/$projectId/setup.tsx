import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

export const Route = createFileRoute("/dashboard/$projectId/setup")({
  head: () => ({ meta: [{ title: "Setup · Spoor" }] }),
  component: SetupPage,
});

function SetupPage() {
  const { project } = getRouteApi("/dashboard/$projectId").useLoaderData();
  const [copied, setCopied] = useState(false);

  const appUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env["APP_URL"] ?? "http://localhost:5173");

  const snippet = `<script defer src="${appUrl}/spoor.js" data-project="${project.publicKey}"></script>`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the text
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link to="/dashboard">← Back</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
          <p className="text-sm text-muted-foreground">Snippet installation</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Install the tracking snippet</CardTitle>
          <CardDescription>
            Paste this tag inside the{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">&lt;head&gt;</code>{" "}
            of every page you want to track.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative rounded-md border border-border bg-muted p-4">
            <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-sm text-foreground">
              {snippet}
            </pre>
          </div>
          <Button onClick={handleCopy} variant="outline" size="sm">
            {copied ? "Copied!" : "Copy snippet"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="w-28 shrink-0 text-muted-foreground">Project ID</span>
            <code className="font-mono text-foreground">{project.id}</code>
          </div>
          <div className="flex gap-2">
            <span className="w-28 shrink-0 text-muted-foreground">Public key</span>
            <code className="font-mono text-foreground">{project.publicKey}</code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
