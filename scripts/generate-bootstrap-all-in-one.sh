#!/usr/bin/env bash
# Regenera backend/database_migrations/petimi_vet/BOOTSTRAP_NEW_SUPABASE_ALL_IN_ONE.sql
# a partir da mesma ordem que scripts/bootstrap-new-supabase.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT="backend/database_migrations/petimi_vet/BOOTSTRAP_NEW_SUPABASE_ALL_IN_ONE.sql"

files=(
  "supabase/migrations/petivet_prod_structure.sql"
  "supabase/migrations/20251108184400_update_vet_trigger_with_document_fields.sql"
  "supabase/migrations/20251108184733_fix_vet_trigger_experience_field.sql"
  "backend/database_migrations/petimi_vet/bootstrap_attach_auth_triggers.sql"
  "backend/database_migrations/petimi_vet/create_freelancers_table.sql"
  "backend/database_migrations/petimi_vet/create_demand_applications_unified.sql"
  "backend/database_migrations/petimi_vet/create_work_proof_table.sql"
  "backend/database_migrations/petimi_vet/create_messages_system.sql"
  "backend/database_migrations/petimi_vet/add_demand_id_to_messages.sql"
  "backend/database_migrations/petimi_vet/create_notifications_system.sql"
  "backend/database_migrations/petimi_vet/create_storage_buckets.sql"
)

{
  echo "-- ============================================================================="
  echo "-- PetMi Vet — bootstrap completo para NOVO projeto Supabase (banco vazio)"
  echo "-- Execute no Dashboard: SQL Editor → colar este arquivo → Run"
  echo "-- Ordem: igual a scripts/bootstrap-new-supabase.sh"
  echo "--"
  echo "-- Regenerar este arquivo: ./scripts/generate-bootstrap-all-in-one.sh"
  echo "-- Se der timeout no Run, execute seção a seção (marcadores -- FICHEIRO:)."
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
