import { describe, it, expect } from "vitest";
import {
  bucketGranularity,
  bucketKey,
  enumerateBuckets,
  snapToBucket,
  type DateRange,
} from "./analytics-buckets";

// ── bucketGranularity ─────────────────────────────────────────────────────────

describe("bucketGranularity", () => {
  it("returns 'hour' for a range of exactly 0 ms", () => {
    const t = new Date("2024-06-01T00:00:00Z");
    expect(bucketGranularity({ from: t, to: t })).toBe("hour");
  });

  it("returns 'hour' for a 1-hour range", () => {
    const from = new Date("2024-06-01T00:00:00Z");
    const to = new Date("2024-06-01T01:00:00Z");
    expect(bucketGranularity({ from, to })).toBe("hour");
  });

  it("returns 'hour' for a range of exactly 2 days", () => {
    const from = new Date("2024-06-01T00:00:00Z");
    const to = new Date("2024-06-03T00:00:00Z"); // exactly 2 days
    expect(bucketGranularity({ from, to })).toBe("hour");
  });

  it("returns 'day' for a range of 2 days + 1 ms", () => {
    const from = new Date("2024-06-01T00:00:00Z");
    const to = new Date(from.getTime() + 2 * 24 * 60 * 60 * 1000 + 1);
    expect(bucketGranularity({ from, to })).toBe("day");
  });

  it("returns 'day' for a 7-day range", () => {
    const from = new Date("2024-06-01T00:00:00Z");
    const to = new Date("2024-06-08T00:00:00Z");
    expect(bucketGranularity({ from, to })).toBe("day");
  });

  it("returns 'day' for a 30-day range", () => {
    const from = new Date("2024-06-01T00:00:00Z");
    const to = new Date("2024-07-01T00:00:00Z");
    expect(bucketGranularity({ from, to })).toBe("day");
  });
});

// ── bucketKey ─────────────────────────────────────────────────────────────────

describe("bucketKey", () => {
  it("truncates to the hour for hour granularity", () => {
    const ts = new Date("2024-06-01T14:37:22.000Z");
    expect(bucketKey(ts, "hour")).toBe("2024-06-01T14:00:00Z");
  });

  it("truncates to midnight for day granularity", () => {
    const ts = new Date("2024-06-01T14:37:22.000Z");
    expect(bucketKey(ts, "day")).toBe("2024-06-01");
  });

  it("handles midnight exactly for hour granularity", () => {
    const ts = new Date("2024-06-01T00:00:00.000Z");
    expect(bucketKey(ts, "hour")).toBe("2024-06-01T00:00:00Z");
  });

  it("handles end-of-day for day granularity", () => {
    const ts = new Date("2024-06-01T23:59:59.999Z");
    expect(bucketKey(ts, "day")).toBe("2024-06-01");
  });

  it("produces different keys for different hours", () => {
    const t1 = new Date("2024-06-01T10:00:00Z");
    const t2 = new Date("2024-06-01T11:00:00Z");
    expect(bucketKey(t1, "hour")).not.toBe(bucketKey(t2, "hour"));
  });

  it("produces the same day key for two timestamps on the same UTC day", () => {
    const t1 = new Date("2024-06-01T00:00:00Z");
    const t2 = new Date("2024-06-01T23:59:59Z");
    expect(bucketKey(t1, "day")).toBe(bucketKey(t2, "day"));
  });
});

// ── snapToBucket ──────────────────────────────────────────────────────────────

describe("snapToBucket", () => {
  it("snaps to the start of the hour", () => {
    const ts = new Date("2024-06-01T14:37:22.500Z");
    const snapped = snapToBucket(ts, "hour");
    expect(snapped.toISOString()).toBe("2024-06-01T14:00:00.000Z");
  });

  it("snaps to UTC midnight for day granularity", () => {
    const ts = new Date("2024-06-01T14:37:22.500Z");
    const snapped = snapToBucket(ts, "day");
    expect(snapped.toISOString()).toBe("2024-06-01T00:00:00.000Z");
  });

  it("is idempotent when already at the boundary", () => {
    const ts = new Date("2024-06-01T14:00:00.000Z");
    expect(snapToBucket(ts, "hour").toISOString()).toBe(ts.toISOString());
  });
});

// ── enumerateBuckets ──────────────────────────────────────────────────────────

describe("enumerateBuckets", () => {
  it("enumerates hour buckets for a 3-hour range", () => {
    const range: DateRange = {
      from: new Date("2024-06-01T10:00:00Z"),
      to: new Date("2024-06-01T12:00:00Z"),
    };
    const keys = enumerateBuckets(range, "hour");
    expect(keys).toEqual([
      "2024-06-01T10:00:00Z",
      "2024-06-01T11:00:00Z",
      "2024-06-01T12:00:00Z",
    ]);
  });

  it("enumerates day buckets for a 3-day range", () => {
    const range: DateRange = {
      from: new Date("2024-06-01T00:00:00Z"),
      to: new Date("2024-06-03T00:00:00Z"),
    };
    const keys = enumerateBuckets(range, "day");
    expect(keys).toEqual(["2024-06-01", "2024-06-02", "2024-06-03"]);
  });

  it("returns a single bucket when from and to are in the same hour", () => {
    const range: DateRange = {
      from: new Date("2024-06-01T10:15:00Z"),
      to: new Date("2024-06-01T10:45:00Z"),
    };
    const keys = enumerateBuckets(range, "hour");
    expect(keys).toEqual(["2024-06-01T10:00:00Z"]);
  });

  it("returns a single bucket when from and to are on the same day", () => {
    const range: DateRange = {
      from: new Date("2024-06-01T08:00:00Z"),
      to: new Date("2024-06-01T20:00:00Z"),
    };
    const keys = enumerateBuckets(range, "day");
    expect(keys).toEqual(["2024-06-01"]);
  });

  it("snaps the start to the bucket boundary when from is mid-hour", () => {
    const range: DateRange = {
      from: new Date("2024-06-01T10:30:00Z"),
      to: new Date("2024-06-01T12:00:00Z"),
    };
    const keys = enumerateBuckets(range, "hour");
    // 10:30 snaps to 10:00, so we get 10, 11, 12
    expect(keys).toEqual([
      "2024-06-01T10:00:00Z",
      "2024-06-01T11:00:00Z",
      "2024-06-01T12:00:00Z",
    ]);
  });

  it("handles a range spanning midnight (day buckets)", () => {
    const range: DateRange = {
      from: new Date("2024-05-31T00:00:00Z"),
      to: new Date("2024-06-02T00:00:00Z"),
    };
    const keys = enumerateBuckets(range, "day");
    expect(keys).toEqual(["2024-05-31", "2024-06-01", "2024-06-02"]);
  });

  it("produces 25 hour buckets for a range spanning a DST boundary (UTC is unaffected)", () => {
    // UTC doesn't have DST; 24 hours = 24 buckets + 1 for the start = 25
    const range: DateRange = {
      from: new Date("2024-03-10T00:00:00Z"),
      to: new Date("2024-03-11T00:00:00Z"),
    };
    const keys = enumerateBuckets(range, "hour");
    expect(keys).toHaveLength(25);
  });
});

// ── date-range boundary semantics ─────────────────────────────────────────────

describe("date-range boundary semantics", () => {
  it("bucketKey is deterministic for the same input", () => {
    const ts = new Date("2024-06-15T09:22:11.123Z");
    expect(bucketKey(ts, "hour")).toBe(bucketKey(ts, "hour"));
    expect(bucketKey(ts, "day")).toBe(bucketKey(ts, "day"));
  });

  it("events at the exact from boundary are included", () => {
    const from = new Date("2024-06-01T00:00:00Z");
    const to = new Date("2024-06-03T00:00:00Z");
    const range: DateRange = { from, to };
    const keys = enumerateBuckets(range, "day");
    expect(keys[0]).toBe("2024-06-01");
  });

  it("events at the exact to boundary are included", () => {
    const from = new Date("2024-06-01T00:00:00Z");
    const to = new Date("2024-06-03T00:00:00Z");
    const range: DateRange = { from, to };
    const keys = enumerateBuckets(range, "day");
    expect(keys[keys.length - 1]).toBe("2024-06-03");
  });
});
