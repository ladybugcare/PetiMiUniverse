#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage:
  ./scripts/list-migrations.sh [local|staging|production]

If an environment name is provided, the script looks for these variables:
  local:      SB_LOCAL_DB_URL (falls back to DATABASE_URL)
  staging:    SB_STG_DB_URL
  production: SB_PROD_DB_URL

Without arguments, it uses DATABASE_URL directly.
EOF
}

selected_env="${1:-}"

case "$selected_env" in
  "" )
    db_url="${DATABASE_URL:-}"
    ;;
  local )
    db_url="${SB_LOCAL_DB_URL:-${DATABASE_URL:-}}"
    ;;
  staging | stg )
    db_url="${SB_STG_DB_URL:-}"
    ;;
  production | prod )
    db_url="${SB_PROD_DB_URL:-}"
    ;;
  -h | --help )
    usage
    exit 0
    ;;
  * )
    echo "Unknown environment: $selected_env" >&2
    usage
    exit 1
    ;;
esac

if [[ -z "${db_url:-}" ]]; then
  echo "No DATABASE_URL found for '${selected_env:-default}' environment." >&2
  usage
  exit 1
fi

psql "$db_url" -At <<'SQL'
select
  name,
  to_char(inserted_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC' as applied_at_utc
from supabase_migrations.schema_migrations
order by inserted_at;
SQL
