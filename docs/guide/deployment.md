# Deployment

Spoor ships with a production `docker-compose.yml` (app + Postgres 16) and a multi-stage `Dockerfile`. Two supported paths: plain Docker Compose on any host, or Dokploy.

## Docker Compose

### 1. Prepare `.env`

```sh
cp .env.example .env
```

Edit `.env` and set:

```sh
POSTGRES_PASSWORD=<strong-random-password>
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
SPOOR_HASH_SECRET=$(openssl rand -base64 32)
APP_URL=https://analytics.example.com
BETTER_AUTH_URL=https://analytics.example.com
```

Compose refuses to start if `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, or `SPOOR_HASH_SECRET` are unset.

::: warning
Rotating `SPOOR_HASH_SECRET` invalidates all historical visitor hashes — existing sessions will appear as new visitors.
:::

### 2. Build and start

```sh
docker compose up --build -d
```

Boot order: the app container waits for Postgres to pass its `pg_isready` healthcheck, runs database migrations, then starts the server. Migrations are idempotent — safe to re-run on every restart.

### 3. Verify

```sh
docker compose ps          # both services should show "healthy"
curl -i http://localhost:3000/login   # expect HTTP 200
docker exec $(docker compose ps -q app) whoami   # expect "spoor" (non-root)
```

The app container runs as the non-root `spoor` user, and its healthcheck polls `/login` — the same endpoint you curl above.

### Data persistence

Postgres data lives in the `spoor-data` named volume and survives container restarts and rebuilds.

## Dokploy

Dokploy fronts the app with Traefik. The app trusts `X-Forwarded-For` for visitor IP extraction, so IPs resolve correctly behind the proxy.

1. **Create a new service** → type: **Compose**.
2. **Source**: point to your repo (or paste the `docker-compose.yml`).
3. **Domain**: add your domain (e.g. `analytics.example.com`). Traefik handles TLS.
4. **Environment variables**: add all required variables (see [Configuration](/reference/configuration)). Set `APP_URL` and `BETTER_AUTH_URL` to your domain with `https://`.
5. **Deploy**. Dokploy builds the image, starts the stack, and routes traffic through Traefik.

::: tip
`POSTGRES_PASSWORD` in the compose file controls the DB password. Set it to a strong value in Dokploy's env panel — it is never committed to the repo.
:::

## Configuration

See [Configuration](/reference/configuration) for the full environment-variable reference.
