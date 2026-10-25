#!/bin/sh
set -e

# ==============================================================================
# AccessAI Production Container Entrypoint
# ==============================================================================
# Ensures database migrations are applied to the persistent volume at /app/data
# before serving traffic, then hands over execution to the main command.
# ==============================================================================

echo "[AccessAI Docker] Verifying SQLite storage directory..."
mkdir -p /app/data

echo "[AccessAI Docker] Applying database migrations to ${DATABASE_URL:-/app/data/accessai.db}..."
npm run db:migrate || {
  echo "[AccessAI Docker] Database migration failed! Aborting container startup."
  exit 1
}

echo "[AccessAI Docker] Migrations applied successfully. Starting application server..."
exec "$@"
