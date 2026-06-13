# Spoor

Self-hosted, cookieless web analytics. Drop one script tag on any site; see page views, clicks, custom events, and session timelines in a private dashboard.

## Features

- Multi-project: one Spoor instance, many sites
- Cookieless visitor identity (daily-rotating HMAC hash — no cookies, no localStorage)
- Embeddable snippet: auto page views (including SPA navigations), `data-track` clicks, `window.spoor.track(name, props)`
- Dashboard: time-series chart, top pages, top referrers, click/custom events table, session list + journey timeline
- Single-admin posture: registration is open only while the users table is empty

## Quick start (local dev)

Requires Docker (for the Postgres container).

```sh
pnpm install
pnpm dev          # boots Postgres on :5433, runs migrations, serves http://localhost:5173
```

No `.env` is needed locally — dev uses fallbacks for all secrets and `DATABASE_URL` (matching the dev Postgres). To override, `cp .env.example .env` first.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `BETTER_AUTH_SECRET` | yes | Random secret for better-auth session signing. Generate: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | yes | Public base URL of the app (used for CSRF / cookie domain) |
| `APP_URL` | yes | Public base URL shown in the snippet install page |
| `SPOOR_HASH_SECRET` | yes | Secret for daily visitor-hash salt. Generate: `openssl rand -base64 32`. Rotating this invalidates historical hashes. |
| `POSTGRES_PASSWORD` | compose only | Postgres password used by `docker-compose.yml`. Not needed when `DATABASE_URL` is set directly. |
| `PORT` | no | Port the app listens on (default: `3000`) |

## Production deploy with Docker Compose

### 1. Prepare `.env`

```sh
cp .env.example .env
# Edit .env:
#   POSTGRES_PASSWORD=<strong-random-password>
#   BETTER_AUTH_SECRET=$(openssl rand -base64 32)
#   SPOOR_HASH_SECRET=$(openssl rand -base64 32)
#   APP_URL=https://analytics.example.com
#   BETTER_AUTH_URL=https://analytics.example.com
```

### 2. Build and start

```sh
docker compose up --build -d
```

The app container waits for Postgres to be healthy, runs migrations, then starts the server. Migrations are idempotent — safe to re-run on restart.

### 3. Verify

```sh
docker compose ps          # both services should show "healthy"
curl -i http://localhost:3000/login   # expect HTTP 200
docker exec $(docker compose ps -q app) whoami   # expect "spoor" (non-root)
```

Data persists in the `spoor-data` named volume across restarts.

## Deploy to Dokploy

Dokploy fronts the app with Traefik. The app trusts `X-Forwarded-For` for visitor IP extraction.

1. **Create a new service** → type: **Compose**.
2. **Source**: point to your repo (or paste the `docker-compose.yml`).
3. **Domain**: add your domain (e.g. `analytics.example.com`). Traefik handles TLS.
4. **Environment variables**: add all variables from the table above. Set `APP_URL` and `BETTER_AUTH_URL` to your domain with `https://`.
5. **Deploy**. Dokploy builds the image, starts the stack, and routes traffic through Traefik.

> **Note**: `POSTGRES_PASSWORD` in the compose file controls the DB password. Set it to a strong value in Dokploy's env panel — it is never committed to the repo.

## Tracking snippet

After creating a project, copy the snippet from the **Setup** page:

```html
<script defer src="https://analytics.example.com/spoor.js" data-project="<your-public-key>"></script>
```

### Manual tracking

```js
// Custom event
window.spoor.track('signup', { plan: 'pro' });
```

### Declarative click tracking

```html
<button data-track="upgrade-cta">Upgrade</button>
```

## Development

```sh
pnpm typecheck   # TypeScript check
pnpm build       # production build → dist/
pnpm test        # vitest unit tests
pnpm db:generate # generate new Drizzle migration after schema changes
pnpm db:migrate  # apply migrations
```
