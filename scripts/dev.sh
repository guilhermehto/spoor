#!/usr/bin/env bash
# Per-worktree dev launcher.
#
# Lets several git worktrees run `pnpm dev` simultaneously without colliding on
# the Postgres container name, the Postgres host port, the Vite port, or the
# database itself. Everything is derived from the worktree directory, so there
# is nothing to configure per branch.
set -euo pipefail

compose() { docker compose -f docker-compose.dev.yml "$@"; }

# Compose isolates containers, networks and volumes by project name. It already
# defaults to the worktree directory name; we set it explicitly so the value is
# stable no matter where the script is invoked from.
project="$(basename "$PWD")"
export COMPOSE_PROJECT_NAME="$project"

# Start Postgres. The host port is auto-assigned (see docker-compose.dev.yml),
# so two worktrees never fight over 5433.
compose up -d --wait

# Read back the host port Docker chose and build the connection string. $NF is
# robust to both IPv4 (0.0.0.0:PORT) and IPv6 ([::]:PORT) mappings.
db_port="$(compose port postgres 5432 | awk -F: 'NR==1 {print $NF}')"
if [ -z "${db_port:-}" ]; then
  echo "dev.sh: could not determine the Postgres host port" >&2
  exit 1
fi
export DATABASE_URL="postgres://spoor:spoor@localhost:${db_port}/spoor"

# Pick a Vite port that is stable for this worktree (so the URL doesn't change
# between runs) but guaranteed free (probe upward from the derived base).
base=$(( 5173 + ($(cksum <<<"$project" | cut -d' ' -f1) % 800) ))
app_port="$(node -e 'const net=require("net");let p=+process.argv[1];(function probe(){const s=net.createServer();s.once("error",()=>{p++;probe();});s.listen(p,()=>s.close(()=>console.log(p)));})();' "$base")"
export BETTER_AUTH_URL="http://localhost:${app_port}"
export APP_URL="http://localhost:${app_port}"

printf '\n  \xe2\x96\xb8 %s\n    db    localhost:%s\n    app   http://localhost:%s\n\n' \
  "$project" "$db_port" "$app_port"

pnpm db:migrate
pnpm db:seed
exec vite dev --port "$app_port" --strictPort
