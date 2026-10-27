#!/usr/bin/env bash
# Runs the pgTAP files against the linked project with psql (`supabase test db` needs Docker).
# Each file rolls back. Needs SUPABASE_DB_PASSWORD (read from ../../.env if present).
set -euo pipefail
cd "$(dirname "$0")"
[ -f ../../.env ] && set -a && . ../../.env && set +a
REF=$(cat ../.temp/project-ref)
HOST=$(cat ../.temp/pooler-url 2>/dev/null | sed -E 's|.*@([^:/]+).*|\1|' || true)
export PGPASSWORD="$SUPABASE_DB_PASSWORD"
URL="postgresql://postgres.${REF}@${HOST:-aws-0-ap-southeast-2.pooler.supabase.com}:5432/postgres?sslmode=require"
status=0
for f in ${@:-*.test.sql}; do
  out=$(psql "$URL" -X -q -t -A -v ON_ERROR_STOP=1 -f "$f" 2>&1) || status=1
  echo "$out" | grep -v '^$'
  echo "$out" | grep -qE '^not ok|Looks like|ERROR' && status=1
done
exit $status
