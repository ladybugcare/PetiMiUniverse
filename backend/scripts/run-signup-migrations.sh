#!/bin/bash

# ========================================
# Script para executar migrações do novo fluxo de signup
# Executa as migrações em local, staging e produção
# ========================================

set -e

MIGRATIONS_DIR="$(cd "$(dirname "$0")/../database_migrations/petimi_vet" && pwd)"
MIGRATIONS=(
  "make_clinic_id_nullable_in_clinic_users.sql"
  "add_pending_clinic_status.sql"
  "update_trigger_no_auto_clinic_creation.sql"
)

echo "=========================================="
echo "Executando migrações do novo fluxo de signup"
echo "=========================================="
echo ""

# Função para executar migração em um ambiente
run_migration() {
  local env=$1
  local migration_file=$2
  local migration_path="$MIGRATIONS_DIR/$migration_file"
  
  echo "📄 Executando: $migration_file"
  echo "🌍 Ambiente: $env"
  
  if [ "$env" = "local" ]; then
    # Local: Supabase Docker na porta 54321
    echo "   Conectando ao Supabase local (Docker)..."
    echo "   Execute manualmente no Supabase Studio: http://localhost:54323"
    echo "   Ou use: psql -h localhost -p 54322 -U postgres -d postgres -f $migration_path"
    echo ""
  elif [ "$env" = "staging" ]; then
    # Staging: Supabase Cloud
    echo "   ⚠️  Para staging, execute manualmente no Supabase Dashboard"
    echo "   Ou use: supabase db push --db-url \$STAGING_DB_URL < $migration_path"
    echo ""
  elif [ "$env" = "production" ]; then
    # Production: Supabase Cloud
    echo "   ⚠️  Para produção, execute manualmente no Supabase Dashboard"
    echo "   Ou use: supabase db push --db-url \$PROD_DB_URL < $migration_path"
    echo ""
  fi
}

# Função para listar instruções
show_instructions() {
  local env=$1
  
  echo "=========================================="
  echo "Instruções para $env:"
  echo "=========================================="
  
  if [ "$env" = "local" ]; then
    echo ""
    echo "1. Acesse o Supabase Studio: http://localhost:54323"
    echo "2. Vá em 'SQL Editor'"
    echo "3. Execute cada migration na ordem:"
    for migration in "${MIGRATIONS[@]}"; do
      echo "   - $migration"
    done
    echo ""
    echo "Ou via psql:"
    echo "  psql -h localhost -p 54322 -U postgres -d postgres -f \$MIGRATION_FILE"
    echo ""
  elif [ "$env" = "staging" ] || [ "$env" = "production" ]; then
    echo ""
    echo "1. Acesse o Supabase Dashboard: https://supabase.com/dashboard"
    echo "2. Selecione o projeto $env"
    echo "3. Vá em 'SQL Editor'"
    echo "4. Execute cada migration na ordem:"
    for migration in "${MIGRATIONS[@]}"; do
      echo "   - $migration"
    done
    echo ""
    echo "⚠️  IMPORTANTE: Faça backup antes de executar em produção!"
    echo ""
  fi
}

# Menu principal
echo "Selecione o ambiente:"
echo "1) Local (Supabase Docker)"
echo "2) Staging (Supabase Cloud)"
echo "3) Production (Supabase Cloud)"
echo "4) Todos os ambientes (mostrar instruções)"
echo ""
read -p "Escolha uma opção (1-4): " choice

case $choice in
  1)
    show_instructions "local"
    ;;
  2)
    show_instructions "staging"
    ;;
  3)
    show_instructions "production"
    ;;
  4)
    show_instructions "local"
    echo ""
    show_instructions "staging"
    echo ""
    show_instructions "production"
    ;;
  *)
    echo "Opção inválida"
    exit 1
    ;;
esac

echo ""
echo "=========================================="
echo "Migrações a executar:"
echo "=========================================="
for migration in "${MIGRATIONS[@]}"; do
  echo "  ✅ $migration"
done
echo ""
echo "Ordem de execução:"
echo "  1. make_clinic_id_nullable_in_clinic_users.sql"
echo "  2. add_pending_clinic_status.sql"
echo "  3. update_trigger_no_auto_clinic_creation.sql"
echo ""
echo "⚠️  Execute as migrações na ordem correta!"
echo ""

