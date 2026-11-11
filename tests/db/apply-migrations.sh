#!/usr/bin/env bash
# Apply supabase-stub.sql + all migrations to a throwaway local PostgreSQL database.
# Usage: PGHOST=... PGPORT=... tests/db/apply-migrations.sh <dbname>
set -euo pipefail
db="${1:-mfin_test}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists ${db}" -c "create database ${db}"
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$root/tests/db/supabase-stub.sql"
for f in "$root"/supabase/migrations/*.sql; do
  # pg_cron / pg_net are stubbed; skip only their create extension statements.
  sed -E '/^create extension if not exists pg_(cron|net) /d' "$f" \
    | psql -X -q -v ON_ERROR_STOP=1 -d "$db" >/dev/null 2>"/tmp/mfin-migration.err" \
    || { echo "FAILED: $(basename "$f")"; cat /tmp/mfin-migration.err; exit 1; }
done
echo "applied $(ls "$root"/supabase/migrations/*.sql | wc -l) migrations to ${db}"
