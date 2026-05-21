#!/usr/bin/env bash
# Lists SQL files in order for a NEW empty Supabase project (SQL Editor).
# Run each file once, top to bottom; fix any error before continuing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

files=(
  "supabase/migrations/petivet_prod_structure.sql"
  "supabase/migrations/20251108184400_update_vet_trigger_with_document_fields.sql"
  "supabase/migrations/20251108184733_fix_vet_trigger_experience_field.sql"
  "backend/database_migrations/bootstrap_attach_auth_triggers.sql"
  "backend/database_migrations/create_freelancers_table.sql"
  "backend/database_migrations/create_demand_applications_unified.sql"
  "backend/database_migrations/create_work_proof_table.sql"
  "backend/database_migrations/create_messages_system.sql"
  "backend/database_migrations/add_demand_id_to_messages.sql"
  "backend/database_migrations/create_notifications_system.sql"
  "backend/database_migrations/create_storage_buckets.sql"
)

echo "=== New Supabase bootstrap — run in SQL Editor (Dashboard → SQL) ==="
echo "Repo: $ROOT"
echo ""
echo "Um único ficheiro (colar tudo de uma vez):"
echo "  backend/database_migrations/BOOTSTRAP_NEW_SUPABASE_ALL_IN_ONE.sql"
echo "  Regenerar: ./scripts/generate-bootstrap-all-in-one.sh"
echo ""
i=0
for f in "${files[@]}"; do
  i=$((i + 1))
  if [[ ! -f "$f" ]]; then
    echo "MISSING ($i): $f" >&2
    exit 1
  fi
  echo "$i. $f"
done
echo ""
echo "Optional after the above:"
echo "  - backend/database_migrations/00_DIAGNOSE_DATABASE.sql"
echo "  - backend/database_migrations/01_FIX_ALL_ERRORS.sql (only if diagnose says you need fixes)"
echo ""
echo "Cluster backup (.backup): do not paste whole file. Use:"
echo "  python3 scripts/extract_public_from_supabase_cluster_dump.py <dump> ./tmp/extracted-public.sql"
