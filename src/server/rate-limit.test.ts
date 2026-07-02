import { describe, it, expect } from "vitest";
import { rateLimitOk, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from "./rate-limit";

describe("rateLimitOk", () => {
  const t0 = 1_700_000_000_000;

  it("allows requests under the limit", () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      expect(rateLimitOk("under", t0 + i)).toBe(true);
    }
  });

  it("rejects the 61st request in the same window", () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      expect(rateLimitOk("over", t0)).toBe(true);
    }
    expect(rateLimitOk("over", t0)).toBe(false);
  });

  it("resets in a new window", () => {
    for (let i = 0; i <= RATE_LIMIT_MAX; i++) {
      rateLimitOk("reset", t0);
    }
    expect(rateLimitOk("reset", t0)).toBe(false);
    expect(rateLimitOk("reset", t0 + RATE_LIMIT_WINDOW_MS)).toBe(true);
  });

  it("tracks keys independently", () => {
    for (let i = 0; i <= RATE_LIMIT_MAX; i++) {
      rateLimitOk("busy", t0);
    }
    expect(rateLimitOk("busy", t0)).toBe(false);
    expect(rateLimitOk("quiet", t0)).toBe(true);
  });
});
