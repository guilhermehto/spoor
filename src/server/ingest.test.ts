import { describe, it, expect } from "vitest";
import {
  resolveSession,
  isBot,
  parseAndValidate,
  SESSION_TIMEOUT_MS,
  type OpenSession,
} from "./ingest";

// ── resolveSession ─────────────────────────────────────────────────────────────

describe("resolveSession", () => {
  const baseTime = new Date("2024-06-01T12:00:00Z");

  it("creates a new session when there is no open session", () => {
    const result = resolveSession(null, baseTime);
    expect(result.action).toBe("create");
  });

  it("reuses a session when last_seen_at is within 30 minutes", () => {
    const session: OpenSession = {
      id: "sess-1",
      lastSeenAt: new Date(baseTime.getTime() - 10 * 60 * 1000), // 10 min ago
    };
    const result = resolveSession(session, baseTime);
    expect(result.action).toBe("reuse");
    if (result.action === "reuse") {
      expect(result.sessionId).toBe("sess-1");
    }
  });

  it("reuses a session when last_seen_at is exactly at the boundary (exclusive)", () => {
    // 1 ms before the timeout boundary — should still reuse
    const session: OpenSession = {
      id: "sess-2",
      lastSeenAt: new Date(baseTime.getTime() - SESSION_TIMEOUT_MS + 1),
    };
    const result = resolveSession(session, baseTime);
    expect(result.action).toBe("reuse");
  });

  it("creates a new session when last_seen_at is exactly at the timeout boundary", () => {
    const session: OpenSession = {
      id: "sess-3",
      lastSeenAt: new Date(baseTime.getTime() - SESSION_TIMEOUT_MS),
    };
    const result = resolveSession(session, baseTime);
    expect(result.action).toBe("create");
  });

  it("creates a new session when last_seen_at is beyond 30 minutes", () => {
    const session: OpenSession = {
      id: "sess-4",
      lastSeenAt: new Date(baseTime.getTime() - 31 * 60 * 1000), // 31 min ago
    };
    const result = resolveSession(session, baseTime);
    expect(result.action).toBe("create");
  });

  it("advances last_seen_at conceptually — two events within window share a session", () => {
    const t0 = new Date("2024-06-01T12:00:00Z");
    const t1 = new Date("2024-06-01T12:10:00Z");
    const t2 = new Date("2024-06-01T12:20:00Z");

    // First event: no session → create
    const r0 = resolveSession(null, t0);
    expect(r0.action).toBe("create");

    // Second event: session from t0, now at t1 (10 min gap) → reuse
    const sess: OpenSession = { id: "sess-5", lastSeenAt: t0 };
    const r1 = resolveSession(sess, t1);
    expect(r1.action).toBe("reuse");

    // Third event: session last seen at t1, now at t2 (10 min gap) → reuse
    const sess2: OpenSession = { id: "sess-5", lastSeenAt: t1 };
    const r2 = resolveSession(sess2, t2);
    expect(r2.action).toBe("reuse");
  });

  it("creates a new session after >30 min of inactivity", () => {
    const t0 = new Date("2024-06-01T12:00:00Z");
    const t3 = new Date("2024-06-01T12:31:00Z"); // 31 min later

    const sess: OpenSession = { id: "sess-6", lastSeenAt: t0 };
    const result = resolveSession(sess, t3);
    expect(result.action).toBe("create");
  });
});

// ── isBot ──────────────────────────────────────────────────────────────────────

describe("isBot", () => {
  it("detects common bot user-agents", () => {
    expect(isBot("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(true);
    expect(isBot("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("Twitterbot/1.0")).toBe(true);
    expect(isBot("LinkedInBot/1.0")).toBe(true);
    expect(isBot("AhrefsBot/7.0")).toBe(true);
    expect(isBot("SemrushBot/7~bl")).toBe(true);
    expect(isBot("DotBot/1.2")).toBe(true);
    expect(isBot("ia_archiver (+http://www.alexa.com/site/help/webmasters)")).toBe(true);
  });

  it("does not flag real browser user-agents", () => {
    expect(
      isBot(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
    expect(
      isBot(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
    expect(isBot("")).toBe(false);
  });
});

// ── parseAndValidate ───────────────────────────────────────────────────────────

describe("parseAndValidate", () => {
  function encode(s: string): number {
    return new TextEncoder().encode(s).byteLength;
  }

  const valid = JSON.stringify({
    k: "abc123",
    t: "pageview",
    p: "/home",
    h: "example.com",
  });

  it("accepts a minimal valid payload", () => {
    const result = parseAndValidate(valid, encode(valid));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.k).toBe("abc123");
      expect(result.payload.t).toBe("pageview");
      expect(result.payload.p).toBe("/home");
      expect(result.payload.h).toBe("example.com");
    }
  });

  it("accepts click and custom types", () => {
    for (const t of ["click", "custom"]) {
      const body = JSON.stringify({ k: "x", t, p: "/", h: "h.com", n: "btn" });
      const r = parseAndValidate(body, encode(body));
      expect(r.ok).toBe(true);
    }
  });

  it("accepts the error type with message and props", () => {
    const body = JSON.stringify({
      k: "x",
      t: "error",
      p: "/checkout",
      h: "h.com",
      n: "TypeError: undefined is not a function",
      props: {
        kind: "error",
        source: "https://h.com/app.js",
        line: 42,
        col: 7,
        stack: "TypeError: undefined is not a function\n    at f (app.js:42:7)",
      },
    });
    const r = parseAndValidate(body, encode(body));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.t).toBe("error");
      expect(r.payload.n).toBe("TypeError: undefined is not a function");
      expect(r.payload.props).toMatchObject({ kind: "error", line: 42 });
    }
  });

  it("accepts an error event without a name", () => {
    const body = JSON.stringify({
      k: "x",
      t: "error",
      p: "/",
      h: "h.com",
      props: { kind: "unhandledrejection" },
    });
    const r = parseAndValidate(body, encode(body));
    expect(r.ok).toBe(true);
  });

  it("rejects body exceeding 8 KB", () => {
    const big = "x".repeat(8193);
    const result = parseAndValidate(big, 8193);
    expect(result.ok).toBe(false);
  });

  it("rejects invalid JSON", () => {
    const result = parseAndValidate("{not json}", 10);
    expect(result.ok).toBe(false);
  });

  it("rejects missing required field k", () => {
    const body = JSON.stringify({ t: "pageview", p: "/", h: "h.com" });
    const result = parseAndValidate(body, encode(body));
    expect(result.ok).toBe(false);
  });

  it("rejects invalid type", () => {
    const body = JSON.stringify({ k: "x", t: "unknown", p: "/", h: "h.com" });
    const result = parseAndValidate(body, encode(body));
    expect(result.ok).toBe(false);
  });

  it("rejects path longer than 512 chars", () => {
    const body = JSON.stringify({
      k: "x",
      t: "pageview",
      p: "/" + "a".repeat(512),
      h: "h.com",
    });
    const result = parseAndValidate(body, encode(body));
    expect(result.ok).toBe(false);
  });

  it("rejects name longer than 512 chars", () => {
    const body = JSON.stringify({
      k: "x",
      t: "click",
      p: "/",
      h: "h.com",
      n: "a".repeat(513),
    });
    const result = parseAndValidate(body, encode(body));
    expect(result.ok).toBe(false);
  });

  it("rejects props exceeding 2 KB serialized", () => {
    const props: Record<string, string> = {};
    // Build a props object whose JSON serialization exceeds 2048 bytes
    for (let i = 0; i < 100; i++) {
      props[`key_${i}`] = "v".repeat(30);
    }
    const body = JSON.stringify({ k: "x", t: "pageview", p: "/", h: "h.com", props });
    const result = parseAndValidate(body, encode(body));
    expect(result.ok).toBe(false);
  });

  it("accepts optional fields r and props", () => {
    const body = JSON.stringify({
      k: "x",
      t: "custom",
      p: "/",
      h: "h.com",
      n: "checkout",
      r: "https://google.com",
      props: { plan: "pro" },
    });
    const result = parseAndValidate(body, encode(body));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.r).toBe("https://google.com");
      expect(result.payload.props).toEqual({ plan: "pro" });
    }
  });

  it("rejects a JSON array at the top level", () => {
    const body = JSON.stringify([1, 2, 3]);
    const result = parseAndValidate(body, encode(body));
    expect(result.ok).toBe(false);
  });
});
