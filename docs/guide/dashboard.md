# Dashboard

A tour of what each dashboard page shows and lets you do. All analytics pages share the same project chrome: a sidebar with a project switcher (jump between projects, back to "All projects", or sign out) and nav entries for Overview, Sessions, Events, Errors, and Settings; a topbar with the page title and a **date range control** with `24h`, `7d`, `30d`, and `90d` presets (bucketed by UTC day, default `7d`); and a light/dark theme toggle. The selected range is carried in the URL (`from`/`to` query params) and applies to Overview, Sessions, Events, and Errors alike — switching pages preserves it.

## Projects

`/dashboard` is the home page: a list of your projects, each showing its name and public tracking key.

- **Create** — enter a name in the "New project" form and click Create. Each project gets a unique tracking key for its snippet.
- **Open** — per-project **Overview** and **Setup** buttons.
- **Delete** — asks for inline confirmation first; deleting removes the project *and all its analytics data*, irreversibly.

The header shows your account email and a sign-out button.

## Overview

`/dashboard/:projectId` is the per-project landing page for the selected date range:

- **Onboarding callout** — until the project receives its first event, a "Waiting for your first event…" card links to the [Setup](#setup) page and polls until data arrives.
- **Active now** — live count of currently active visitors, refreshed every 30 seconds.
- **Metric cards** — Page views, Unique visitors, Sessions, Avg. session duration, and Bounce rate, each with a percent delta vs. the previous window (or a "new" badge when there's no baseline).
- **Traffic over time** — a time-series chart of page views and visitors across the range.
- **Top pages** — ranked bar list of most-viewed paths.
- **Top referrers** — ranked bar list of external referrers, reduced to their host.
- **Events** — ranked event names with a click/custom type badge.
- **Devices** — ranked breakdown, toggleable between Browser, OS, and Device dimensions (no refetch — the toggle is instant).
- **Campaigns** — UTM breakdown, toggleable between Source, Medium, and Campaign.

## Events

`/dashboard/:projectId/events` covers click and custom events in the selected range:

- **Summary cards** — Events fired (and how many distinct types), Click events, Custom events (each with their share of all fires), and Event types.
- **All events table** — one row per event name, ranked by fire count. Each row shows rank, a `click`/`custom` type badge, the event name (click events also show their trigger selector), a share bar, the count, and its percentage of all fires.
- **Property breakdown** — custom-event rows expand on click. Pick any property key (for example `tenant_id`) to see the exact number of events per value; click a value to drill in, then switch the key (for example to `user_id`) to segment within it. Active filters show as removable chips. Loaded lazily and cached; the top 50 values per key are shown. Click rows don't expand.
- **Export CSV** — button in the table header; see [CSV export](#csv-export).

## Errors

`/dashboard/:projectId/errors` lists captured JS errors, grouped by message and ranked by occurrences. The header shows the total error count and the number of distinct messages in range.

Each group row shows the error **message**, its **occurrence count**, and **when it was last seen**. Click a row to expand the latest occurrence:

- error kind (e.g. uncaught exception vs. rejection) and the **page path** it happened on
- **source location** as `source:line:col`
- the captured **stack trace** (or "No stack trace captured")

## Sessions

`/dashboard/:projectId/sessions` lists visitor sessions in the selected range, 50 at a time with a **Load more** button. Each row shows a shortened session ID, the **entry page**, the **referrer** (or "direct"), page and event counts, and the session **duration**.

Click a row to expand the session's **journey timeline**: every step in order with its absolute time (UTC) and offset from session start, a type badge (`pageview`, `click`, `custom`, error), and the page path or event name. Custom events also show their properties as JSON.

An **Export CSV** button sits in the header; see [CSV export](#csv-export).

## Setup

Reached from the sidebar's **Settings** entry (or the Setup button on the Projects page), `/dashboard/:projectId/setup` shows the project's install snippet:

```html
<script defer src="https://your-spoor-host/spoor.js" data-project="YOUR_PUBLIC_KEY"></script>
```

The page renders the exact tag for your deployment and project key with a **Copy snippet** button — paste it inside the `<head>` of every page you want to track. It also lists the project's **Project ID** and **Public key**. See [Tracking Snippet](/guide/tracking) for what the snippet captures and its JS API.

## CSV export

`GET /api/export` returns a CSV download, triggered by the **Export CSV** buttons on the Events and Sessions pages (which pass the currently selected date range).

| Param | Required | Value |
|---|---|---|
| `projectId` | yes | project ID (must be a project you own) |
| `kind` | yes | `events` or `sessions` |
| `from` | yes | range start, ISO date string |
| `to` | yes | range end, ISO date string |

Columns:

- `kind=events` — `name`, `type`, `count` (aggregated event counts in range)
- `kind=sessions` — `sessionId`, `entryPath`, `referrer`, `startedAt`, `lastSeenAt`, `durationSeconds`, `eventCount`, `pageviewCount`, `interactionCount`

Responses: `401` without a session, `404` for projects you don't own, `400` for missing or malformed params. Exports are capped at 10,000 rows. The file downloads as `spoor-<kind>-<from>-<to>.csv`.

::: tip
The export endpoint requires your dashboard login session — it works from the browser you're signed in with, not with the public tracking key.
:::
