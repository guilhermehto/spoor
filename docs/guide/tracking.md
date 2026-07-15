# Tracking Snippet

`spoor.js` is a single dependency-free, cookieless script. It emits four event types: **pageview** (load + SPA navigation), **click** (`[data-track]` elements), **custom** (`window.spoor.track`), and **error** (uncaught errors + unhandled promise rejections).

## Installation

Copy the snippet from your project's **Setup** page in the dashboard:

```html
<script defer src="https://analytics.example.com/spoor.js" data-project="<your-public-key>"></script>
```

- `data-project` is required. Without it the snippet does nothing.
- The snippet derives the ingest origin from its own `src` URL and posts to `<origin>/api/ingest` — so it works cross-origin: host Spoor on `analytics.example.com` and embed the tag on any other site.
- Events are sent with `navigator.sendBeacon`, falling back to `fetch` with `keepalive: true`. Send failures are silently swallowed and never break the host page.

## Automatic pageviews

A pageview fires:

- On initial load (immediately, or on `DOMContentLoaded` if the document is still parsing).
- On SPA navigation: `history.pushState` and `history.replaceState` are wrapped, and `popstate` is listened to.

The tracked path is `location.pathname + location.search + location.hash`. Consecutive pageviews for the same path are deduplicated — a `replaceState` to the current URL sends nothing. `document.referrer` is included when non-empty.

## Click tracking

Add a `data-track` attribute to any element:

```html
<button data-track="upgrade-cta">Upgrade</button>
```

A capture-phase click listener walks up from the click target and sends a click event named after the first `data-track` value it finds, so clicks on children of a tracked element (an icon inside a button) are attributed correctly.

## Custom events

The snippet exposes one global, `window.spoor`. Its main method is `track`:

```js
window.spoor.track(name, props);
```

```js
// Custom event
window.spoor.track('signup', { plan: 'pro' });
```

Behavior:

| Argument | Rules |
| --- | --- |
| `name` | Required. Falsy name → the call is a no-op. Coerced with `String()`. |
| `props` | Optional. Attached only if it is a plain object — arrays and non-objects are dropped. |

The event also carries the current path (`pathname + search + hash`) and hostname.

## Global properties

`identify` attaches properties to every event the snippet sends from then on: pageviews, clicks, custom events, and errors. Call it once you know who the visitor is, for example after login:

```js
window.spoor.identify({ tenant_id: 'acme', user_id: 'u_123' });
```

- Globals are merged into each event's props. Per-call `track` props win on key collisions, so `track('signup', { tenant_id: 'other' })` overrides the global `tenant_id` for that one event.
- Calling `identify` again merges on top by key; it does not clear keys you set earlier.
- `clearIdentify()` drops all globals. Call it on logout.

```js
window.spoor.clearIdentify();
```

This is how you segment usage by tenant or user in the dashboard. See [Property breakdown](/guide/dashboard#events). Values are stored verbatim in the analytics database, so send stable ids (tenant/user), not raw PII like emails or names.

## Error tracking

The snippet automatically captures:

- `window` `error` events (uncaught script errors) — with message, source file, line, column, and stack when available. Events without a message or error object are ignored.
- `unhandledrejection` events — with the rejection reason's message and stack (or the stringified reason; falls back to `"Unhandled promise rejection"`).

Hard caps, to keep a crash loop from hammering the ingest endpoint:

| Limit | Value |
| --- | --- |
| Errors per page load | 10 |
| Message length | 512 chars |
| Source (filename) length | 256 chars |
| Stack length | 1024 chars |

Longer values are truncated, and errors past the per-load cap are dropped.

## How cookieless identity works

The snippet sends no identifier at all — no cookies, no `localStorage`, no fingerprinting client-side. Visitor identity is computed server-side per event:

```
salt         = HMAC-SHA-256(SPOOR_HASH_SECRET, "YYYY-MM-DD")   // UTC date
visitor hash = SHA-256(salt + projectId + clientIp + userAgent)
```

- The salt rotates at UTC midnight, so the same physical visitor gets a different hash on different calendar days. Hashes are also scoped per project — the same visitor on two projects yields two unrelated hashes.
- The client IP is taken from the right-most `X-Forwarded-For` entry (the hop appended by your own reverse proxy), falling back to the socket address.

Consequences:

- No cookies or storage means no persistent cross-site identity to manage client-side.
- Visitor identity resets daily: a session spanning UTC midnight counts as two visitors, and returning-visitor tracking across days is by design impossible.
- Rotating [`SPOOR_HASH_SECRET`](/reference/configuration) invalidates the link between historical hashes and current visitors — old data stays, but continuity breaks.

::: warning
Keep `SPOOR_HASH_SECRET` stable and secret. Anyone who knows it and a visitor's IP + user agent can recompute that visitor's hash.
:::
