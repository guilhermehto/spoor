/**
 * /demo?key=<publicKey>
 *
 * Embeds the live spoor.js snippet and provides buttons that exercise all
 * three event types so you can verify rows appear in analytics_events.
 */
import { createFileRoute, notFound } from "@tanstack/react-router";

declare global {
  interface Window {
    spoor?: { track: (name: string, props?: Record<string, unknown>) => void };
  }
}

export const Route = createFileRoute("/demo")({
  beforeLoad: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(import.meta as any).env?.DEV) {
      throw notFound();
    }
  },
  validateSearch: (search: Record<string, unknown>) => ({
    key: typeof search["key"] === "string" ? search["key"] : undefined,
  }),
  component: DemoPage,
});

function DemoPage() {
  const { key } = Route.useSearch();

  const appUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env["APP_URL"] ?? "http://localhost:5173");

  if (!key) {
    return (
      <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
        <h1>Spoor Demo</h1>
        <p>
          Pass a project public key via the <code>key</code> query parameter:
        </p>
        <pre>
          <code>{appUrl}/demo?key=YOUR_PUBLIC_KEY</code>
        </pre>
      </main>
    );
  }

  const snippetSrc = `${appUrl}/spoor.js`;

  return (
    <>
      {/* Inject the tracking snippet — data-project carries the public key */}
      <script defer src={snippetSrc} data-project={key} />

      <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: "640px" }}>
        <h1>Spoor Demo</h1>
        <p style={{ color: "#666", fontSize: "0.9rem" }}>
          Project key: <code>{key}</code>
        </p>
        <p>
          This page embeds the live <code>spoor.js</code> snippet. Interact with
          the controls below, then query <code>analytics_events</code> to see
          the rows.
        </p>

        <hr style={{ margin: "1.5rem 0" }} />

        <section>
          <h2 style={{ fontSize: "1.1rem" }}>1. Pageview (automatic)</h2>
          <p style={{ color: "#555", fontSize: "0.9rem" }}>
            A <code>pageview</code> event was sent when this page loaded.
          </p>
        </section>

        <hr style={{ margin: "1.5rem 0" }} />

        <section>
          <h2 style={{ fontSize: "1.1rem" }}>2. Click events</h2>
          <p style={{ color: "#555", fontSize: "0.9rem" }}>
            Each button carries a <code>data-track</code> attribute — the
            snippet captures the click automatically.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              data-track="signup-cta"
              style={{
                padding: "0.5rem 1.25rem",
                background: "#0f172a",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.95rem",
              }}
            >
              Sign up (tracked)
            </button>
            <button
              data-track="upgrade-cta"
              style={{
                padding: "0.5rem 1.25rem",
                background: "#7c3aed",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.95rem",
              }}
            >
              Upgrade (tracked)
            </button>
          </div>
        </section>

        <hr style={{ margin: "1.5rem 0" }} />

        <section>
          <h2 style={{ fontSize: "1.1rem" }}>3. Custom events</h2>
          <p style={{ color: "#555", fontSize: "0.9rem" }}>
            Each button calls <code>window.spoor.track</code> with distinct
            event names and props.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              onClick={() => {
                if (
                  typeof window !== "undefined" &&
                  window.spoor &&
                  typeof window.spoor.track === "function"
                ) {
                  window.spoor.track("checkout", { plan: "pro" });
                }
              }}
              style={{
                padding: "0.5rem 1.25rem",
                background: "#0f172a",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.95rem",
              }}
            >
              Checkout (custom event)
            </button>
            <button
              onClick={() => {
                if (
                  typeof window !== "undefined" &&
                  window.spoor &&
                  typeof window.spoor.track === "function"
                ) {
                  window.spoor.track("video_play", { id: "intro-tour", seconds: 0 });
                }
              }}
              style={{
                padding: "0.5rem 1.25rem",
                background: "#0369a1",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.95rem",
              }}
            >
              Play video (custom event)
            </button>
            <button
              onClick={() => {
                if (
                  typeof window !== "undefined" &&
                  window.spoor &&
                  typeof window.spoor.track === "function"
                ) {
                  window.spoor.track("search", { query: "getting started" });
                }
              }}
              style={{
                padding: "0.5rem 1.25rem",
                background: "#0369a1",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.95rem",
              }}
            >
              Search (custom event)
            </button>
          </div>
        </section>

        <hr style={{ margin: "1.5rem 0" }} />

        <section>
          <h2 style={{ fontSize: "1.1rem" }}>4. SPA navigation</h2>
          <p style={{ color: "#555", fontSize: "0.9rem" }}>
            Each button pushes a new history entry via{" "}
            <code>history.pushState</code> — the snippet fires a{" "}
            <code>pageview</code> for each distinct <code>p</code> value while
            staying on the <code>/demo</code> pathname.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            {(
              [
                { label: "→ /pricing", p: "/pricing" },
                { label: "→ /features", p: "/features" },
                { label: "→ /docs", p: "/docs" },
              ] as const
            ).map(({ label, p }) => (
              <button
                key={p}
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.history.pushState(
                      {},
                      "",
                      "/demo?key=" + key + "&p=" + p,
                    );
                  }
                }}
                style={{
                  padding: "0.5rem 1.25rem",
                  background: "#334155",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "0.95rem",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <hr style={{ margin: "1.5rem 0" }} />

        <p style={{ fontSize: "0.85rem", color: "#888" }}>
          After interacting, run:
          <br />
          <code>
            {
              "psql postgres://spoor:spoor@localhost:5433/spoor -c \"SELECT type, name, path, created_at FROM analytics_events ORDER BY created_at DESC LIMIT 10;\""
            }
          </code>
        </p>
      </main>
    </>
  );
}
