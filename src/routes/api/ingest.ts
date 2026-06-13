/**
 * POST /api/ingest — CORS-open event ingest endpoint.
 *
 * Accepts any Content-Type (navigator.sendBeacon sends text/plain).
 * Returns 202 on success, 400 on bad payload, 404 on unknown project key.
 * Bot requests return 202 but are not stored.
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  parseAndValidate,
  findProjectByKey,
  persistEvent,
  isBot,
} from "~/server/ingest";
import { computeVisitorHash, extractClientIp } from "~/server/visitor";

const MAX_BODY_BYTES = 8 * 1024; // 8 KB — must match ingest.ts inner guard

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export const Route = createFileRoute("/api/ingest")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        // Handle CORS preflight — use ANY so the framework doesn't intercept OPTIONS
        if (request.method === "OPTIONS") {
          return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        if (request.method !== "POST") {
          return new Response(JSON.stringify({ error: "method not allowed" }), {
            status: 405,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        // Reject oversized bodies before buffering — avoids memory DoS.
        const contentLength = request.headers.get("content-length");
        if (contentLength !== null && Number(contentLength) > MAX_BODY_BYTES) {
          return new Response(JSON.stringify({ error: "payload too large" }), {
            status: 413,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        // Read raw body as text regardless of Content-Type
        const rawBody = await request.text();
        const bodyByteLength = new TextEncoder().encode(rawBody).byteLength;

        const validation = parseAndValidate(rawBody, bodyByteLength);
        if (!validation.ok) {
          return new Response(JSON.stringify({ error: validation.reason }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        const { payload } = validation;

        // Resolve project
        const project = await findProjectByKey(payload.k);
        if (!project) {
          return new Response(JSON.stringify({ error: "unknown project key" }), {
            status: 404,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        // Bot detection — accept but do not store
        const userAgent = request.headers.get("user-agent") ?? "";
        if (isBot(userAgent)) {
          return new Response(null, { status: 202, headers: CORS_HEADERS });
        }

        // Extract client IP
        const xForwardedFor = request.headers.get("x-forwarded-for");
        // TanStack Start / Vinxi exposes the socket address via a non-standard
        // header set by the server adapter; fall back to a placeholder when
        // running behind a proxy that always sets X-Forwarded-For.
        const socketAddress =
          request.headers.get("x-real-ip") ??
          request.headers.get("cf-connecting-ip") ??
          "unknown";
        const clientIp = extractClientIp(xForwardedFor, socketAddress);

        const now = new Date();

        const visitorHash = await computeVisitorHash(
          project.id,
          clientIp,
          userAgent,
          now,
        );

        await persistEvent({ projectId: project.id, visitorHash, payload, now });

        return new Response(null, { status: 202, headers: CORS_HEADERS });
      },
    },
  },
});
