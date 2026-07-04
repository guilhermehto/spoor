/**
 * GET /api/export — CSV export of events or sessions for an owned project.
 *
 * Query params: projectId, kind ('events' | 'sessions'), from, to (ISO strings).
 * 401 without a session, 404 for non-owned projects, 400 for bad params.
 */

import { createFileRoute } from "@tanstack/react-router";
import { auth } from "~/lib/auth";
import { db } from "~/db/index";
import {
  requireOwnedProject,
  queryEventCounts,
  querySessions,
  type DateRange,
} from "~/server/analytics";
import { toCsv } from "~/server/csv";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/api/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return jsonError("Unauthorized", 401);
        }

        const params = new URL(request.url).searchParams;
        const projectId = params.get("projectId");
        const kind = params.get("kind");
        const from = params.get("from");
        const to = params.get("to");

        if (!projectId || !from || !to || (kind !== "events" && kind !== "sessions")) {
          return jsonError("projectId, kind (events|sessions), from, to required", 400);
        }

        const range: DateRange = { from: new Date(from), to: new Date(to) };
        if (Number.isNaN(range.from.getTime()) || Number.isNaN(range.to.getTime())) {
          return jsonError("from/to must be ISO dates", 400);
        }

        try {
          await requireOwnedProject(db, projectId, session.user.id);
        } catch {
          return jsonError("Project not found", 404);
        }

        // ponytail: 10k row cap, no streaming — revisit if exports outgrow memory
        let csv: string;
        if (kind === "events") {
          const rows = await queryEventCounts(db, projectId, range, { limit: 10_000 });
          csv = toCsv(
            rows.map((r) => ({ ...r })),
            [
              { key: "name", header: "name" },
              { key: "type", header: "type" },
              { key: "count", header: "count" },
            ],
          );
        } else {
          const rows = await querySessions(db, projectId, range, {
            limit: 10_000,
            offset: 0,
          });
          csv = toCsv(
            rows.map((s) => ({
              sessionId: s.sessionId,
              entryPath: s.entryPath,
              referrer: s.referrer,
              startedAt: s.startedAt.toISOString(),
              lastSeenAt: s.lastSeenAt.toISOString(),
              durationSeconds: s.durationSeconds,
              eventCount: s.eventCount,
              pageviewCount: s.pageviewCount,
              interactionCount: s.interactionCount,
            })),
            [
              { key: "sessionId", header: "sessionId" },
              { key: "entryPath", header: "entryPath" },
              { key: "referrer", header: "referrer" },
              { key: "startedAt", header: "startedAt" },
              { key: "lastSeenAt", header: "lastSeenAt" },
              { key: "durationSeconds", header: "durationSeconds" },
              { key: "eventCount", header: "eventCount" },
              { key: "pageviewCount", header: "pageviewCount" },
              { key: "interactionCount", header: "interactionCount" },
            ],
          );
        }

        const fromDate = range.from.toISOString().slice(0, 10);
        const toDate = range.to.toISOString().slice(0, 10);
        return new Response(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="spoor-${kind}-${fromDate}-${toDate}.csv"`,
          },
        });
      },
    },
  },
});
