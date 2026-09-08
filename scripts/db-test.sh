#!/usr/bin/env bash
# The database's own rules, run against a throwaway Postgres.
#
# CI sets DATABASE_URL and points it at a service container. Locally, with
# Docker running, this starts one and cleans it up afterwards. Either way the
# rules are checked against the real supabase/schema.sql loaded into an empty
# database -- never against the live one.
set -euo pipefail
cd "$(dirname "$0")/.."

run() { psql "$1" -v ON_ERROR_STOP=1 -q -f supabase/test/rules.sql; }

if [ -n "${DATABASE_URL:-}" ]; then
  run "$DATABASE_URL"
  exit
fi

if ! docker info >/dev/null 2>&1; then
  echo "No DATABASE_URL, and Docker is not running." >&2
  echo "Start Docker Desktop, or point DATABASE_URL at an empty Postgres." >&2
  exit 1
fi

NAME=transfer-meter-dbtest
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test \
  -p 55432:5432 postgres:17-alpine >/dev/null

printf 'starting postgres'
for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -q -U postgres 2>/dev/null; then echo; break; fi
  printf '.'; sleep 1
done

run "postgres://postgres:test@127.0.0.1:55432/postgres"
