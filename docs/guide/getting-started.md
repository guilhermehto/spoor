# Getting Started

From clone to your first tracked pageview, locally.

## Prerequisites

- **Docker** — runs the dev Postgres container
- **pnpm** — installs dependencies and runs scripts

## Run locally

```sh
pnpm install
pnpm dev
```

`pnpm dev` runs `scripts/dev.sh`, which:

1. Boots a Postgres container (`docker compose -f docker-compose.dev.yml up -d --wait`)
2. Runs migrations (`pnpm db:migrate`), then seeds the dev account (`pnpm db:seed`)
3. Serves the app with Vite

The README's canonical ports are Postgres on `:5433` and the app on `http://localhost:5173`, but `dev.sh` actually derives ports per git worktree: Docker auto-assigns the Postgres host port, and the Vite port is a stable per-worktree offset from 5173 (probed upward until free). This lets several worktrees run `pnpm dev` at once without colliding. The script prints the ports it chose:

```
  ▸ spoor
    db    localhost:5433
    app   http://localhost:5173
```

No `.env` is needed locally: `dev.sh` exports `DATABASE_URL`, `BETTER_AUTH_URL`, and `APP_URL` to match the chosen ports, and dev fallbacks cover the remaining secrets. To override, `cp .env.example .env` first.

## Sign in

`pnpm dev` seeds a ready-to-use admin account after migrations. The login form pre-fills it — just press **Sign in**:

| Field | Value |
|---|---|
| Email | `dev@spoor.local` |
| Password | `spoordev123` |

::: warning Dev only
The seed refuses to run when `NODE_ENV=production`, and the login form only pre-fills these values in dev builds — production bundles never include them. The seed is idempotent, so it's safe on every boot.
:::

Spoor allows a single admin: registration is open only while the users table is empty, and the seeded account claims that slot. To use your own credentials instead, reset the dev database and register at `/register` before the seed runs:

```sh
docker compose -f docker-compose.dev.yml down -v
```

## Track your first site

1. In the dashboard, create a project.
2. Open the project's **Setup** page and copy the snippet:

   ```html
   <script defer src="http://localhost:5173/spoor.js" data-project="<your-public-key>"></script>
   ```

   The `src` points at your Spoor instance; `data-project` is the project's public key. Both are filled in for you on the Setup page.

3. Paste it into your site's `<head>` or just before `</body>`.
4. Visit your site — the pageview appears in the project dashboard.

## Next steps

- [Deployment](/guide/deployment) — run Spoor in production
- [Tracking Snippet](/guide/tracking) — SPA navigations, `data-track` clicks, `window.spoor.track()`
- [Dashboard](/guide/dashboard) — charts, events, session timelines
