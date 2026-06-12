#!/bin/sh
set -e

echo "Running migrations (includes DB readiness wait)..."
node /app/scripts/migrate.mjs

echo "Starting application..."
exec node /app/scripts/serve.mjs
