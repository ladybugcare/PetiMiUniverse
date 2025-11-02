#!/usr/bin/env bash
# Compares Supabase migrations between two environments (local, staging, production).
set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage:
  ./scripts/compare-migrations.sh <env-a> <env-b>

Environments:
  local       -> SB_LOCAL_DB_URL (falls back to DATABASE_URL)
  staging     -> SB_STG_DB_URL
  production  -> SB_PROD_DB_URL

The script prints which migrations exist only in each environment.
EOF
}

if [[ $# -ne 2 ]]; then
  usage
  exit 1
fi

resolve_db_url() {
  local env="$1"
  case "$env" in
    local )
      echo "${SB_LOCAL_DB_URL:-${DATABASE_URL:-}}"
      ;;
    staging | stg )
      echo "${SB_STG_DB_URL:-}"
      ;;
    production | prod )
      echo "${SB_PROD_DB_URL:-}"
      ;;
    * )
      echo ""  # unknown env, handled later
      ;;
  esac
}

env_a="$1"
env_b="$2"

db_url_a="$(resolve_db_url "$env_a")"
db_url_b="$(resolve_db_url "$env_b")"

if [[ -z "$db_url_a" ]]; then
  echo "Database URL for '$env_a' not set. Check your environment variables." >&2
  usage
  exit 1
fi

if [[ -z "$db_url_b" ]]; then
  echo "Database URL for '$env_b' not set. Check your environment variables." >&2
  usage
  exit 1
fi

fetch_migrations() {
  local url="$1"
  psql "$url" -tAc "select name from supabase_migrations.schema_migrations order by name"
}

tmp_a="$(mktemp)"
tmp_b="$(mktemp)"

trap 'rm -f "$tmp_a" "$tmp_b"' EXIT

fetch_migrations "$db_url_a" | awk 'NF' > "$tmp_a"
fetch_migrations "$db_url_b" | awk 'NF' > "$tmp_b"

only_a="$(comm -23 <(sort "$tmp_a") <(sort "$tmp_b") || true)"
only_b="$(comm -13 <(sort "$tmp_a") <(sort "$tmp_b") || true)"

if [[ -z "$only_a" && -z "$only_b" ]]; then
  echo "✅ $env_a and $env_b have the same migration set."
  exit 0
fi

if [[ -n "$only_a" ]]; then
  echo "Missing in $env_b (present in $env_a):"
  echo "$only_a" | sed 's/^/  - /'
fi

if [[ -n "$only_b" ]]; then
  echo "Missing in $env_a (present in $env_b):"
  echo "$only_b" | sed 's/^/  - /'
fi
