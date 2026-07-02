import {
  createFileRoute,
  Link,
  Outlet,
  notFound,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { getProjectFn, listProjectsFn } from "~/server/projects";
import {
  buildRange,
  detectPreset,
  type Preset,
} from "~/components/analytics/range-picker";
import { cn } from "~/lib/utils";
import { signOut } from "~/lib/auth-client";

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

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/$projectId")({
  validateSearch,
  beforeLoad: async ({ params }) => {
    const project = await getProjectFn({ data: { projectId: params.projectId } });
    if (!project) {
      throw notFound();
    }
    return { project };
  },
  // Projects list powers the sidebar switcher.
  loader: async () => ({ projects: await listProjectsFn() }),
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

// ── Icons (feather-style, currentColor) ─────────────────────────────────────────

const ICONS = {
  overview: (
    <>
      <rect x="3" y="3" width="18" height="18" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </>
  ),
  sessions: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
  events: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  referrers: (
    <>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </>
  ),
  settings: (
    <>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </>
  ),
} satisfies Record<string, ReactNode>;

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {ICONS[name]}
    </svg>
  );
}

const NAV_ITEMS = [
  { label: "Overview", to: "/dashboard/$projectId", exact: true, icon: "overview" },
  { label: "Sessions", to: "/dashboard/$projectId/sessions", exact: false, icon: "sessions" },
  { label: "Events", to: "/dashboard/$projectId/events", exact: false, icon: "events" },
] as const;

const navLink =
  "flex items-center gap-3 px-3 py-2 text-sm transition-colors";
const navActive = { className: "bg-muted text-foreground font-semibold" };
const navInactive = { className: "text-muted-foreground hover:bg-muted/50" };

const RANGES: Preset[] = ["24h", "7d", "30d", "90d"];

// ── Shell ───────────────────────────────────────────────────────────────────

function ProjectLayout() {
  const { project } = Route.useRouteContext();
  const { projects } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const defaultRange = buildRange("7d");
  const from = search.from ?? defaultRange.from;
  const to = search.to ?? defaultRange.to;

  const title = pathname.endsWith("/sessions")
    ? "Sessions"
    : pathname.endsWith("/events")
      ? "Events"
      : pathname.endsWith("/setup")
        ? "Settings"
        : "Overview";

  const activePreset = detectPreset(from, to);

  // Theme: read + apply persisted choice on mount.
  // ponytail: class-on-mount; brief flash acceptable.
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const t = localStorage.getItem("spoor-theme") === "dark" ? "dark" : "light";
    setTheme(t);
    document.documentElement.classList.toggle("dark", t === "dark");
  }, []);
  function setMode(t: "light" | "dark") {
    setTheme(t);
    document.documentElement.classList.toggle("dark", t === "dark");
    localStorage.setItem("spoor-theme", t);
  }

  function applyRange(preset: Preset) {
    const range = buildRange(preset);
    // to:"." = relative to the current child route, so the active view is preserved.
    navigate({
      to: ".",
      search: (prev) => ({ ...prev, from: range.from, to: range.to }),
      replace: true,
    });
  }

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

  const [switcherOpen, setSwitcherOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex w-[236px] shrink-0 flex-col gap-5 border-r-2 border-border bg-card p-4">
        {/* Wordmark */}
        <div className="flex items-center gap-2">
          <div className="h-[23px] w-[23px] bg-primary" />
          <span className="text-lg font-bold tracking-tight">Spoor</span>
        </div>

        {/* Project switcher */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setSwitcherOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 border-2 border-border bg-muted px-3 py-2 text-left"
          >
            <span className="min-w-0">
              <span className="eyebrow block">Project</span>
              <span className="block truncate text-sm font-semibold">
                {project.name}
              </span>
            </span>
            <span aria-hidden className="text-muted-foreground">
              ▾
            </span>
          </button>
          {switcherOpen && (
            <>
              {/* outside-click backdrop */}
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setSwitcherOpen(false)}
              />
              <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto border-2 border-border bg-card">
                {projects.map((p) => (
                  <Link
                    key={p.id}
                    to="/dashboard/$projectId"
                    params={{ projectId: p.id }}
                    search={{ from, to }}
                    onClick={() => setSwitcherOpen(false)}
                    className="block truncate px-3 py-2 text-sm hover:bg-muted"
                  >
                    {p.name}
                  </Link>
                ))}
                <Link
                  to="/dashboard"
                  onClick={() => setSwitcherOpen(false)}
                  className="block border-t-2 border-border px-3 py-2 text-sm font-semibold hover:bg-muted"
                >
                  All projects
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="block w-full border-t-2 border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              params={{ projectId: project.id }}
              search={{ from, to }}
              activeOptions={{ exact: item.exact, includeSearch: false }}
              className={navLink}
              activeProps={navActive}
              inactiveProps={navInactive}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ))}

          {/* Referrers — DEFERRED, inert */}
          <div
            aria-disabled
            className={cn(navLink, "cursor-default text-muted-foreground/50")}
          >
            <Icon name="referrers" />
            Referrers
          </div>

          {/* Settings → setup */}
          <Link
            to="/dashboard/$projectId/setup"
            params={{ projectId: project.id }}
            search={{ from, to }}
            activeOptions={{ includeSearch: false }}
            className={navLink}
            activeProps={navActive}
            inactiveProps={navInactive}
          >
            <Icon name="settings" />
            Settings
          </Link>
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex items-center justify-between gap-4 border-b-2 border-border bg-background px-6 py-4">
          <div className="min-w-0">
            <h1 className="text-[19px] font-semibold leading-tight">{title}</h1>
            <p className="truncate text-sm text-muted-foreground">
              {project.name} · spoor.example
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Range segmented control — presets bucket by UTC day */}
            <span className="eyebrow">Range · UTC</span>
            <div className="flex items-center border-2 border-border bg-muted">
              {RANGES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyRange(p)}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium",
                    activePreset === p
                      ? "bg-card text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Light / Dark segmented control */}
            <div className="flex items-center border-2 border-border bg-muted">
              {(["light", "dark"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium capitalize",
                    theme === m
                      ? "bg-card text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
