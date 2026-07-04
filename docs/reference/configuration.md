# Configuration

Spoor is configured entirely through environment variables. In production (Docker Compose) they come from `.env`; in local dev, `pnpm dev` exports `DATABASE_URL`, `BETTER_AUTH_URL`, and `APP_URL` for you and dev fallbacks cover the secrets. See [Deployment](/guide/deployment) for the production workflow.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes in production | `postgres://spoor:spoor@localhost:5433/spoor` (dev fallback) | Postgres connection string. Docker Compose constructs it from `POSTGRES_PASSWORD` automatically. |
| `BETTER_AUTH_SECRET` | Yes in production | Dev only: `dev-secret-change-me` | Secret for better-auth session signing. No production default — the app refuses to start without it. |
| `BETTER_AUTH_URL` | No | `http://localhost:5173` | Public base URL of the app, used by better-auth for cookie domain and CSRF. Set to your production domain when deploying. |
| `APP_URL` | No | `http://localhost:5173` | Public base URL used as the `src` origin in the [tracking snippet](/guide/tracking). Set to your production domain when deploying. |
| `SPOOR_HASH_SECRET` | Yes in production | Dev only: `dev-hash-secret-change-me` | Secret used to derive the daily visitor-hash salt via HMAC-SHA-256. No production default — the app refuses to start without it. |
| `PORT` | No | `3000` | Port the server listens on. Under Docker Compose it sets the *published host port* (the container always listens on 3000). |
| `HOST` | No | `0.0.0.0` | Bind address of the production server. |
| `SPOOR_RETENTION_DAYS` | No | unset (keep forever) | Delete analytics data older than N days. See [Data retention](#data-retention). |
| `NODE_ENV` | No | unset | `production` enables the boot-time secret guard and disables dev fallbacks and the dev seed. Set automatically by the Docker image. |

`POSTGRES_PASSWORD` is consumed only by `docker-compose.yml`, which uses it to build `DATABASE_URL` for the app container. It is not read by the app itself and is not needed when you set `DATABASE_URL` directly. (`VITEST` is set by the test runner to disable the retention sweep in tests — not operator configuration.)

::: tip Generating secrets
Generate `BETTER_AUTH_SECRET` and `SPOOR_HASH_SECRET` with:

```sh
openssl rand -base64 32
```
:::

::: warning Rotating SPOOR_HASH_SECRET
Rotating `SPOOR_HASH_SECRET` invalidates all historical visitor hashes: returning visitors are counted as new visitors and ongoing sessions restart. Rotate only if the secret may have leaked.
:::

::: danger Production secret guard
With `NODE_ENV=production`, Spoor exits at boot with a fatal error if `SPOOR_HASH_SECRET` or `BETTER_AUTH_SECRET` is missing, empty, or whitespace-only — an empty string injected by Compose (when the host variable is unset) counts as absent. The dev fallback values exist **only** under `pnpm dev`; they are never used in production.
:::

## Data retention

Retention is opt-in. Set `SPOOR_RETENTION_DAYS=N` to delete analytics data older than `N` days. A value that is unset, empty, non-numeric, or `<= 0` disables the feature entirely — data is kept forever.

When enabled, a prune sweep runs **once at server boot** and then **every 24 hours** (in-process timer). Each sweep, using a cutoff of `now − N days`:

1. Deletes sessions whose `lastSeenAt` is older than the cutoff. Their events are removed by foreign-key cascade.
2. Deletes remaining events with `createdAt` older than the cutoff — this can trim the oldest events from a still-open, very long-lived session's timeline.

Each sweep logs a summary line (`retention: pruned data older than N days (...)`). A prune failure is logged and never crashes the server.

::: warning Single-node timer
The sweep is an in-process `setInterval`, suitable for a single instance. If you run multiple app instances, move pruning to an external cron.
:::

## Rate limiting

Only the ingest endpoint (`/api/ingest`) is rate-limited. The limiter is a **fixed window**: at most **60 requests per 10 seconds, keyed per client IP**. A client over the limit receives **HTTP 429** with an empty body (CORS headers included); the counter resets when its 10-second window expires.

The limiter is in-memory and per-instance — it is not shared across replicas. Its map is bounded at 10,000 keys: on overflow, expired entries are dropped first, and if the map is still full it resets entirely.

None of these values are configurable via environment variables; they are constants (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`) in `src/server/rate-limit.ts`.
