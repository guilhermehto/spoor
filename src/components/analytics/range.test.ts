import { describe, it, expect } from "vitest";
import { buildRange, detectPreset } from "./range-picker";

// Fixed reference point: 2024-06-15T12:00:00Z (a Saturday, mid-day UTC)
const NOW = new Date("2024-06-15T12:00:00.000Z");

// ── buildRange ────────────────────────────────────────────────────────────────

describe("buildRange", () => {
  it("today: from is UTC midnight, to is end of day", () => {
    const { from, to } = buildRange("today", undefined, undefined, NOW);
    expect(from).toBe("2024-06-15T00:00:00.000Z");
    expect(to).toBe("2024-06-15T23:59:59.999Z");
  });

  it("7d: from is 6 days ago UTC midnight, to is end of today", () => {
    const { from, to } = buildRange("7d", undefined, undefined, NOW);
    expect(from).toBe("2024-06-09T00:00:00.000Z");
    expect(to).toBe("2024-06-15T23:59:59.999Z");
  });

  it("30d: from is 29 days ago UTC midnight, to is end of today", () => {
    const { from, to } = buildRange("30d", undefined, undefined, NOW);
    expect(from).toBe("2024-05-17T00:00:00.000Z");
    expect(to).toBe("2024-06-15T23:59:59.999Z");
  });

  it("custom: uses provided from/to dates", () => {
    const { from, to } = buildRange("custom", "2024-06-01", "2024-06-10", NOW);
    expect(from).toBe("2024-06-01T00:00:00.000Z");
    expect(to).toBe("2024-06-10T23:59:59.999Z");
  });

  it("custom: falls back to 7-day window when no dates provided", () => {
    const { from, to } = buildRange("custom", undefined, undefined, NOW);
    // from = now - 6 days (approx), to = end of now's day
    expect(new Date(from).getTime()).toBeLessThan(NOW.getTime());
    expect(new Date(to).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("produces different results for different `now` values", () => {
    const r1 = buildRange("today", undefined, undefined, new Date("2024-06-15T12:00:00Z"));
    const r2 = buildRange("today", undefined, undefined, new Date("2024-06-16T12:00:00Z"));
    expect(r1.from).not.toBe(r2.from);
  });
});

// ── detectPreset ──────────────────────────────────────────────────────────────

describe("detectPreset", () => {
  it("detects 'today' preset", () => {
    const { from, to } = buildRange("today", undefined, undefined, NOW);
    expect(detectPreset(from, to, NOW)).toBe("today");
  });

  it("detects '7d' preset", () => {
    const { from, to } = buildRange("7d", undefined, undefined, NOW);
    expect(detectPreset(from, to, NOW)).toBe("7d");
  });

  it("detects '30d' preset", () => {
    const { from, to } = buildRange("30d", undefined, undefined, NOW);
    expect(detectPreset(from, to, NOW)).toBe("30d");
  });

  it("returns 'custom' for an arbitrary range", () => {
    const { from, to } = buildRange("custom", "2024-01-01", "2024-03-31", NOW);
    expect(detectPreset(from, to, NOW)).toBe("custom");
  });

  it("round-trips: buildRange then detectPreset returns the same preset", () => {
    for (const preset of ["today", "7d", "30d"] as const) {
      const { from, to } = buildRange(preset, undefined, undefined, NOW);
      expect(detectPreset(from, to, NOW)).toBe(preset);
    }
  });
});
