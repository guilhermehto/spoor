import { createFileRoute } from "@tanstack/react-router";
import { Button } from "~/components/ui/button";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Spoor
        </h1>
        <p className="text-muted-foreground">
          Self-hosted, privacy-first web analytics.
        </p>
      </div>
      <Button>Get Started</Button>
    </main>
  );
}
