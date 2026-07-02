import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  utcDateString,
  computeVisitorHash,
  extractClientIp,
} from "./visitor";

describe("utcDateString", () => {
  it("returns YYYY-MM-DD in UTC", () => {
    expect(utcDateString(new Date("2024-03-15T23:59:59Z"))).toBe("2024-03-15");
    expect(utcDateString(new Date("2024-03-16T00:00:00Z"))).toBe("2024-03-16");
  });
});

describe("extractClientIp", () => {
  it("returns the single entry when only one is present", () => {
    expect(extractClientIp("1.2.3.4", "9.9.9.9")).toBe("1.2.3.4");
  });

  it("returns right-most address from a multi-hop X-Forwarded-For", () => {
    expect(extractClientIp("1.2.3.4, 5.6.7.8", "9.9.9.9")).toBe("5.6.7.8");
    expect(extractClientIp("6.6.6.6, 1.2.3.4, 5.6.7.8", "9.9.9.9")).toBe(
      "5.6.7.8",
    );
  });

  it("trims whitespace around entries", () => {
    expect(extractClientIp(" 10.0.0.1 , 10.0.0.2 ", "9.9.9.9")).toBe(
      "10.0.0.2",
    );
  });

  it("skips trailing commas and empty entries", () => {
    expect(extractClientIp("1.2.3.4, 5.6.7.8,", "9.9.9.9")).toBe("5.6.7.8");
    expect(extractClientIp("1.2.3.4,, ", "9.9.9.9")).toBe("1.2.3.4");
  });

  it("falls back to socket address when header is absent or empty", () => {
    expect(extractClientIp(null, "9.9.9.9")).toBe("9.9.9.9");
    expect(extractClientIp(undefined, "9.9.9.9")).toBe("9.9.9.9");
    expect(extractClientIp("", "9.9.9.9")).toBe("9.9.9.9");
    expect(extractClientIp(" , ,", "9.9.9.9")).toBe("9.9.9.9");
  });
});

describe("computeVisitorHash", () => {
  const projectId = "proj-abc";
  const ip = "1.2.3.4";
  const ua = "Mozilla/5.0";

  it("returns a 64-char hex string", async () => {
    const hash = await computeVisitorHash(
      projectId,
      ip,
      ua,
      new Date("2024-01-01T12:00:00Z"),
    );
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same inputs", async () => {
    const now = new Date("2024-01-01T12:00:00Z");
    const h1 = await computeVisitorHash(projectId, ip, ua, now);
    const h2 = await computeVisitorHash(projectId, ip, ua, now);
    expect(h1).toBe(h2);
  });

  it("differs across UTC calendar days (daily salt rotation)", async () => {
    const day1 = new Date("2024-01-01T23:59:59Z");
    const day2 = new Date("2024-01-02T00:00:00Z");
    const h1 = await computeVisitorHash(projectId, ip, ua, day1);
    const h2 = await computeVisitorHash(projectId, ip, ua, day2);
    expect(h1).not.toBe(h2);
  });

  it("differs for different IPs on the same day", async () => {
    const now = new Date("2024-01-01T12:00:00Z");
    const h1 = await computeVisitorHash(projectId, "1.1.1.1", ua, now);
    const h2 = await computeVisitorHash(projectId, "2.2.2.2", ua, now);
    expect(h1).not.toBe(h2);
  });

  it("differs for different projects on the same day", async () => {
    const now = new Date("2024-01-01T12:00:00Z");
    const h1 = await computeVisitorHash("proj-A", ip, ua, now);
    const h2 = await computeVisitorHash("proj-B", ip, ua, now);
    expect(h1).not.toBe(h2);
  });
});
