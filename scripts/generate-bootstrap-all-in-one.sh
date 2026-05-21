#!/usr/bin/env bash
# Regenera backend/database_migrations/BOOTSTRAP_NEW_SUPABASE_ALL_IN_ONE.sql
# a partir da mesma ordem que scripts/bootstrap-new-supabase.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT="backend/database_migrations/BOOTSTRAP_NEW_SUPABASE_ALL_IN_ONE.sql"

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

{
  echo "-- ============================================================================="
  echo "-- PetMi Vet — bootstrap completo para NOVO projeto Supabase (banco vazio)"
  echo "-- Execute no Dashboard: SQL Editor → colar este ficheiro → Run"
  echo "-- Ordem: igual a scripts/bootstrap-new-supabase.sh"
  echo "--"
  echo "-- Regenerar este ficheiro: ./scripts/generate-bootstrap-all-in-one.sh"
  echo "-- Se der timeout no Run, execute secção a secção (marcadores -- FICHEIRO:)."
  echo "-- ============================================================================="
  echo ""
  for i in "${files[@]}"; do
    if [[ ! -f "$i" ]]; then
      echo "MISSING: $i" >&2
      exit 1
    fi
    echo ""
    echo "-- ============================================================================="
    echo "-- FICHEIRO: $i"
    echo "-- ============================================================================="
    echo ""
    cat "$i"
    echo ""
  done
} > "$OUT"

echo "Wrote $OUT ($(wc -l < "$OUT") lines)"
