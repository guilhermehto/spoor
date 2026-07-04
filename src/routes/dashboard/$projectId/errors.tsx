/**
 * Errors view — JS error groups ranked by occurrences, with a sample detail.
 *
 * URL: /dashboard/$projectId/errors
 *
 * Reads `from`/`to` from the shared parent search params (set by the topbar
 * range control).  Rows expand to show the newest occurrence's path,
 * source:line:col and stack.  Error strings are attacker-influenced — all
 * rendering goes through normal React escaping.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  getErrorGroupsFn,
  type ErrorGroupsData,
  type ErrorGroupRow,
} from "~/server/analytics-fns";
import { type JsonValue } from "~/server/analytics";
import { buildRange } from "~/components/analytics/range-picker";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/$projectId/errors")({
  head: () => ({ meta: [{ title: "Errors · Spoor" }] }),
  loaderDeps: ({
    search,
  }: {
    search: { from?: string | undefined; to?: string | undefined };
  }) => {
    const defaultRange = buildRange("7d");
    return {
      from: search.from ?? defaultRange.from,
      to: search.to ?? defaultRange.to,
    };
  },
  loader: async ({ params, deps }) => {
    return getErrorGroupsFn({
      data: { projectId: params.projectId, from: deps.from, to: deps.to },
    });
  },
  component: ErrorsPage,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatLastSeen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface SampleDetail {
  kind?: string | undefined;
  location?: string | undefined;
  stack?: string | undefined;
}

/** Pulls kind / source:line:col / stack out of the sample props, defensively. */
function sampleDetail(props: JsonValue | null): SampleDetail {
  if (!props || typeof props !== "object" || Array.isArray(props)) return {};
  const str = (v: JsonValue | undefined) => (typeof v === "string" ? v : undefined);
  const num = (v: JsonValue | undefined) => (typeof v === "number" ? v : undefined);
  const source = str(props.source);
  const line = num(props.line);
  const col = num(props.col);
  const location =
    source !== undefined
      ? [source, line, col].filter((p) => p !== undefined).join(":")
      : undefined;
  return { kind: str(props.kind), location, stack: str(props.stack) };
}

// ── Error row ─────────────────────────────────────────────────────────────────

function ErrorRow({
  group,
  expanded,
  onToggle,
}: {
  group: ErrorGroupRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const detail = sampleDetail(group.sampleProps);

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="block w-full text-left hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span
            className="min-w-0 flex-1 truncate font-mono text-sm text-foreground"
            title={group.name}
          >
            {group.name}
          </span>
          <span className="w-14 shrink-0 text-right text-sm tabular-nums text-foreground">
            {group.count.toLocaleString()}
          </span>
          <span className="w-32 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
            {formatLastSeen(group.lastSeen)}
          </span>
          <span className="w-4 shrink-0 text-center text-xs text-muted-foreground" aria-hidden>
            <span className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}>
              ▶
            </span>
          </span>
        </div>
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 border-t-2 border-border bg-muted/30 px-4 py-3">
          <div className="eyebrow">Latest occurrence</div>
          <div className="text-xs text-muted-foreground">
            {detail.kind && (
              <>
                <span className="font-semibold uppercase tracking-[0.05em]">{detail.kind}</span>
                {" · "}
              </>
            )}
            <span className="font-mono text-foreground">{group.samplePath || "/"}</span>
          </div>
          {detail.location && (
            <div className="truncate font-mono text-xs text-muted-foreground" title={detail.location}>
              {detail.location}
            </div>
          )}
          {detail.stack ? (
            <pre className="overflow-x-auto bg-muted p-3 font-mono text-xs text-foreground">
              {detail.stack}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">No stack trace captured.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

/** Keyed on `${from}|${to}` by the parent so expand state resets on range change. */
function ErrorsTable({ groups }: { groups: ErrorGroupRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="bg-card border-2 border-border">
      <div className="flex items-center justify-between border-b-2 border-border px-4 py-3">
        <span className="eyebrow">Error groups</span>
        <span className="text-xs text-muted-foreground">Ranked by occurrences</span>
      </div>
      {groups.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">No errors in this range.</p>
      ) : (
        groups.map((g) => (
          <ErrorRow
            key={g.name}
            group={g}
            expanded={expanded === g.name}
            onToggle={() => setExpanded((prev) => (prev === g.name ? null : g.name))}
          />
        ))
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function ErrorsPage() {
  const search = Route.useSearch() as { from?: string; to?: string };
  const data = Route.useLoaderData() as ErrorGroupsData;

  const { from: defaultFrom, to: defaultTo } = buildRange("7d");
  const from = search.from ?? defaultFrom;
  const to = search.to ?? defaultTo;

  return (
    <div className="flex flex-col gap-[18px]">
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm text-foreground">
          <span className="font-bold tabular-nums">{data.total.toLocaleString()}</span>{" "}
          {data.total === 1 ? "error" : "errors"} ·{" "}
          <span className="text-muted-foreground">
            {data.groups.length} distinct {data.groups.length === 1 ? "message" : "messages"}
          </span>
        </h2>
        <p className="shrink-0 text-xs text-muted-foreground">
          Click a row to see the latest occurrence
        </p>
      </header>

      {/* Key on range so expand state resets when range changes. */}
      <ErrorsTable key={`${from}|${to}`} groups={data.groups} />
    </div>
  );
}
