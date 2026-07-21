import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    // Preload routes on hover/touch; cache loader data briefly so
    // back-and-forth navigation doesn't refetch everything.
    defaultPreload: "intent",
    defaultStaleTime: 30_000,
    defaultPreloadStaleTime: 30_000,
    defaultPendingComponent: () => (
      <div className="p-8 text-sm text-muted-foreground">Loading…</div>
    ),
  });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
