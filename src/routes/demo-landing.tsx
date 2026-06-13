/**
 * /demo-landing?key=<publicKey>
 *
 * Dev-only landing page that embeds spoor.js and provides a plain <a> link
 * to /demo so that clicking performs a full-page navigation, setting
 * document.referrer on the destination page.
 */
import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/demo-landing")({
  beforeLoad: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(import.meta as any).env?.DEV) {
      throw notFound();
    }
  },
  validateSearch: (search: Record<string, unknown>) => ({
    key: typeof search["key"] === "string" ? search["key"] : undefined,
  }),
  component: DemoLandingPage,
});

function DemoLandingPage() {
  const { key } = Route.useSearch();

  const appUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env["APP_URL"] ?? "http://localhost:5173");

  if (!key) {
    return (
      <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
        <h1>Spoor Demo Landing</h1>
        <p>
          Pass a project public key via the <code>key</code> query parameter:
        </p>
        <pre>
          <code>{appUrl}/demo-landing?key=YOUR_PUBLIC_KEY</code>
        </pre>
      </main>
    );
  }

  return (
    <>
      {/* Inject the tracking snippet — data-project carries the public key */}
      <script defer src={`${appUrl}/spoor.js`} data-project={key} />

      <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: "640px" }}>
        <h1>Spoor Demo Landing</h1>
        <p style={{ color: "#666", fontSize: "0.9rem" }}>
          Project key: <code>{key}</code>
        </p>
        <p>
          This page embeds <code>spoor.js</code> and acts as a referring page.
          Click the link below to navigate to the demo — the browser will
          perform a full-page navigation so <code>document.referrer</code> on{" "}
          <code>/demo</code> will equal this page's URL.
        </p>

        <hr style={{ margin: "1.5rem 0" }} />

        {/* Plain <a> — NOT TanStack <Link> — so the browser does a full navigation */}
        <a
          href={`/demo?key=${key}`}
          style={{
            display: "inline-block",
            padding: "0.5rem 1.25rem",
            background: "#0f172a",
            color: "#fff",
            borderRadius: "6px",
            textDecoration: "none",
            fontSize: "0.95rem",
          }}
        >
          Go to Demo →
        </a>
      </main>
    </>
  );
}
