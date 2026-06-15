import { describe, it, expect } from "vitest";
import {
  EVENT_TYPES,
  parseFilters,
  serializeFilters,
  activeFilters,
  hasEventFilter,
  resolveEventConstraints,
} from "./event-filters";

// ── parseFilters ──────────────────────────────────────────────────────────────

describe("parseFilters", () => {
  it("returns empty object for empty search string", () => {
    expect(parseFilters("")).toEqual({});
  });

  it("parses a valid type", () => {
    expect(parseFilters("?type=click")).toEqual({ type: "click" });
  });

  it("drops unknown type values", () => {
    expect(parseFilters("?type=unknown")).toEqual({});
  });

  it("drops empty string values", () => {
    expect(parseFilters("?path=&name=")).toEqual({});
  });

  it("parses path and name", () => {
    expect(parseFilters("?path=%2Fpricing&name=signup")).toEqual({
      path: "/pricing",
      name: "signup",
    });
  });

  it("parses all three dimensions together", () => {
    expect(parseFilters("?path=%2F&type=pageview&name=view")).toEqual({
      path: "/",
      type: "pageview",
      name: "view",
    });
  });

  it("accepts URLSearchParams directly", () => {
    const params = new URLSearchParams({ type: "custom", name: "video_play" });
    expect(parseFilters(params)).toEqual({ type: "custom", name: "video_play" });
  });

  it("accepts all EVENT_TYPES values", () => {
    for (const t of EVENT_TYPES) {
      expect(parseFilters(`?type=${t}`)).toEqual({ type: t });
    }
  });
});

// ── serializeFilters ──────────────────────────────────────────────────────────

describe("serializeFilters", () => {
  it("returns empty params for empty filters", () => {
    expect(serializeFilters({}).toString()).toBe("");
  });

  it("omits undefined keys", () => {
    const params = serializeFilters({ path: "/home" });
    expect(params.get("path")).toBe("/home");
    expect(params.has("type")).toBe(false);
    expect(params.has("name")).toBe(false);
  });

  it("serializes all three dimensions", () => {
    const params = serializeFilters({ path: "/", type: "click", name: "cta" });
    expect(params.get("path")).toBe("/");
    expect(params.get("type")).toBe("click");
    expect(params.get("name")).toBe("cta");
  });
});

// ── round-trip ────────────────────────────────────────────────────────────────

describe("round-trip: parseFilters(serializeFilters(f)) === f", () => {
  const cases: Parameters<typeof serializeFilters>[0][] = [
    {},
    { path: "/pricing" },
    { type: "click" },
    { name: "signup" },
    { path: "/", type: "pageview", name: "view" },
    { type: "custom", name: "video_play" },
  ];

  for (const f of cases) {
    it(`round-trips ${JSON.stringify(f)}`, () => {
      expect(parseFilters(serializeFilters(f))).toEqual(f);
    });
  }
});

// ── activeFilters ─────────────────────────────────────────────────────────────

describe("activeFilters", () => {
  it("returns empty array for empty filters", () => {
    expect(activeFilters({})).toEqual([]);
  });

  it("returns only set keys", () => {
    const keys = activeFilters({ path: "/home", type: "click" });
    expect(keys).toContain("path");
    expect(keys).toContain("type");
    expect(keys).not.toContain("name");
  });

  it("returns all three when all are set", () => {
    const keys = activeFilters({ path: "/", type: "pageview", name: "x" });
    expect(keys).toHaveLength(3);
  });
});

// ── hasEventFilter ────────────────────────────────────────────────────────────

describe("hasEventFilter", () => {
  it("returns false for empty filters", () => {
    expect(hasEventFilter({})).toBe(false);
  });

  it("returns false when only path is set", () => {
    expect(hasEventFilter({ path: "/pricing" })).toBe(false);
  });

  it("returns true when type is set", () => {
    expect(hasEventFilter({ type: "click" })).toBe(true);
  });

  it("returns true when name is set", () => {
    expect(hasEventFilter({ name: "signup" })).toBe(true);
  });

  it("returns true when both type and name are set", () => {
    expect(hasEventFilter({ type: "custom", name: "video_play" })).toBe(true);
  });

  it("returns true when path and type are set", () => {
    expect(hasEventFilter({ path: "/", type: "pageview" })).toBe(true);
  });
});

// ── resolveEventConstraints ───────────────────────────────────────────────────

describe("resolveEventConstraints", () => {
  it("injects type=pageview when no type or name is set", () => {
    expect(resolveEventConstraints({})).toEqual({ type: "pageview" });
  });

  it("injects type=pageview even when path is set", () => {
    expect(resolveEventConstraints({ path: "/pricing" })).toEqual({
      path: "/pricing",
      type: "pageview",
    });
  });

  it("passes type through when set, without injecting pageview", () => {
    expect(resolveEventConstraints({ type: "click" })).toEqual({ type: "click" });
  });

  it("passes name through when set, without injecting pageview", () => {
    expect(resolveEventConstraints({ name: "signup" })).toEqual({ name: "signup" });
  });

  it("passes both type and name through", () => {
    expect(resolveEventConstraints({ type: "custom", name: "video_play" })).toEqual({
      type: "custom",
      name: "video_play",
    });
  });

  it("passes path through alongside explicit type", () => {
    expect(resolveEventConstraints({ path: "/", type: "click" })).toEqual({
      path: "/",
      type: "click",
    });
  });

  it("passes path through alongside name (no type injection)", () => {
    expect(resolveEventConstraints({ path: "/", name: "cta" })).toEqual({
      path: "/",
      name: "cta",
    });
  });

  it("does not include name in result when only type is set", () => {
    const result = resolveEventConstraints({ type: "click" });
    expect(result).not.toHaveProperty("name");
  });

  it("does not include type in result when only name is set", () => {
    const result = resolveEventConstraints({ name: "signup" });
    expect(result).not.toHaveProperty("type");
  });
});
