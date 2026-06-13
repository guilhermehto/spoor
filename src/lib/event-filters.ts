/**
 * Pure event-filter model: parse/serialize URL search params, active-filter
 * helpers, and the pageview-default resolution rule.
 *
 * No React or drizzle imports — safe to import from both client routes and
 * server query code.
 */

export const EVENT_TYPES = ["pageview", "click", "custom"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface EventFilters {
  path?: string;
  type?: EventType;
  name?: string;
}

// ── Parse / serialize ─────────────────────────────────────────────────────────

/**
 * Build an `EventFilters` from a URL search string (or `URLSearchParams`).
 * Unknown `type` values and empty strings are silently dropped.
 */
export function parseFilters(search: string | URLSearchParams): EventFilters {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;

  const filters: EventFilters = {};

  const path = params.get("path");
  if (path) filters.path = path;

  const type = params.get("type");
  if (type && (EVENT_TYPES as readonly string[]).includes(type)) {
    filters.type = type as EventType;
  }

  const name = params.get("name");
  if (name) filters.name = name;

  return filters;
}

/**
 * Serialize `EventFilters` to a `URLSearchParams`, omitting keys whose value
 * is `undefined` or an empty string.
 */
export function serializeFilters(filters: EventFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.path) params.set("path", filters.path);
  if (filters.type) params.set("type", filters.type);
  if (filters.name) params.set("name", filters.name);
  return params;
}

// ── Introspection helpers ─────────────────────────────────────────────────────

/**
 * Returns the subset of keys that are actively set (non-empty).
 */
export function activeFilters(filters: EventFilters): (keyof EventFilters)[] {
  return (Object.keys(filters) as (keyof EventFilters)[]).filter(
    (k) => filters[k] !== undefined && filters[k] !== "",
  );
}

/**
 * Returns `true` iff `type` or `name` is set.  A `path`-only filter does not
 * count as an event filter because it does not change the event-type dimension.
 */
export function hasEventFilter(filters: EventFilters): boolean {
  return Boolean(filters.type || filters.name);
}

// ── Pageview-default resolution ───────────────────────────────────────────────

/**
 * Resolve the effective query constraints from `filters`.
 *
 * Rule: when neither `type` nor `name` is set, inject `type='pageview'` so
 * callers always have an explicit event-type constraint.  When either is
 * present, pass them through unchanged.  `path` always passes through.
 */
export function resolveEventConstraints(filters: EventFilters): EventFilters {
  const resolved: EventFilters = {};

  if (filters.path) resolved.path = filters.path;

  if (filters.type || filters.name) {
    if (filters.type) resolved.type = filters.type;
    if (filters.name) resolved.name = filters.name;
  } else {
    resolved.type = "pageview";
  }

  return resolved;
}
