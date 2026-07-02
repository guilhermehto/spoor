import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  // Send everyone to the dashboard; its guard bounces unauthenticated
  // visitors to /login, so no session check is needed here.
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
