import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { auth, type SessionData } from "~/lib/auth";

const getSessionFn = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  return session;
});

// ponytail: client-only session cache — saves one HTTP round trip per nav.
// Server fns still call requireSession() on every request; worst case a
// signed-out tab shows the shell for ≤60s before data calls fail.
let clientSession: SessionData | null = null;
let clientSessionAt = 0;

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const isClient = typeof window !== "undefined";
    let session =
      isClient && Date.now() - clientSessionAt < 60_000 ? clientSession : null;
    if (!session) {
      session = await getSessionFn();
      if (isClient) {
        clientSession = session;
        clientSessionAt = Date.now();
      }
    }
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  return <Outlet />;
}
