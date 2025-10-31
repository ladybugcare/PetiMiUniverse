#!/bin/bash

# Script para testar a implementação do Environment Guard
# Este script valida:
# 1. Estrutura dos arquivos
# 2. Imports corretos
# 3. Lógica básica de validação

echo "🧪 Testando Environment Guard Implementation"
echo "=========================================="
echo ""

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Teste 1: Verificar se arquivos existem
echo "1️⃣  Verificando arquivos..."
FILES=(
  "frontend/src/utils/envGuard.ts"
  "frontend/utils/envGuard.ts"
  "frontend/src/App.tsx"
  "frontend/App.tsx"
  "frontend/src/services/api.ts"
  "docs/ENVIRONMENT_SYNC_GUIDE.md"
)

MISSING_FILES=0
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo -e "${GREEN}✓${NC} $file"
  else
    echo -e "${RED}✗${NC} $file (não encontrado)"
    MISSING_FILES=$((MISSING_FILES + 1))
  fi
done

if [ $MISSING_FILES -eq 0 ]; then
  echo -e "\n${GREEN}✓ Todos os arquivos existem${NC}\n"
else
  echo -e "\n${RED}✗ $MISSING_FILES arquivo(s) faltando${NC}\n"
  exit 1
fi

# Teste 2: Verificar imports
echo "2️⃣  Verificando imports..."

# Web envGuard deve importar supabase correto
if grep -q "from '../services/supabase'" frontend/src/utils/envGuard.ts; then
  echo -e "${GREEN}✓${NC} Web envGuard importa supabase correto"
else
  echo -e "${RED}✗${NC} Web envGuard não importa supabase correto"
fi

# Mobile envGuard deve importar supabase correto
if grep -q "from '../services/supabase'" frontend/utils/envGuard.ts; then
  echo -e "${GREEN}✓${NC} Mobile envGuard importa supabase correto"
else
  echo -e "${RED}✗${NC} Mobile envGuard não importa supabase correto"
fi

# Web App.tsx deve importar enforceEnvConsistency
if grep -q "enforceEnvConsistency" frontend/src/App.tsx; then
  echo -e "${GREEN}✓${NC} Web App.tsx importa enforceEnvConsistency"
else
  echo -e "${RED}✗${NC} Web App.tsx não importa enforceEnvConsistency"
fi

# Mobile App.tsx deve importar enforceEnvConsistency
if grep -q "enforceEnvConsistency" frontend/App.tsx; then
  echo -e "${GREEN}✓${NC} Mobile App.tsx importa enforceEnvConsistency"
else
  echo -e "${RED}✗${NC} Mobile App.tsx não importa enforceEnvConsistency"
fi

# API deve importar handleInvalidToken
if grep -q "handleInvalidToken" frontend/src/services/api.ts; then
  echo -e "${GREEN}✓${NC} API importa handleInvalidToken"
else
  echo -e "${RED}✗${NC} API não importa handleInvalidToken"
fi

echo ""

# Teste 3: Verificar funções exportadas
echo "3️⃣  Verificando exports..."

if grep -q "export const enforceEnvConsistency" frontend/src/utils/envGuard.ts; then
  echo -e "${GREEN}✓${NC} Web: enforceEnvConsistency exportado"
else
  echo -e "${RED}✗${NC} Web: enforceEnvConsistency não exportado"
fi

if grep -q "export const enforceEnvConsistency" frontend/utils/envGuard.ts; then
  echo -e "${GREEN}✓${NC} Mobile: enforceEnvConsistency exportado"
else
  echo -e "${RED}✗${NC} Mobile: enforceEnvConsistency não exportado"
fi

if grep -q "export const handleInvalidToken" frontend/src/utils/envGuard.ts; then
  echo -e "${GREEN}✓${NC} Web: handleInvalidToken exportado"
else
  echo -e "${RED}✗${NC} Web: handleInvalidToken não exportado"
fi

if grep -q "export const handleInvalidToken" frontend/utils/envGuard.ts; then
  echo -e "${GREEN}✓${NC} Mobile: handleInvalidToken exportado"
else
  echo -e "${RED}✗${NC} Mobile: handleInvalidToken não exportado"
fi

echo ""

# Teste 4: Verificar integração no App.tsx
echo "4️⃣  Verificando integração..."

# Web App.tsx deve chamar enforceEnvConsistency no useEffect
if grep -A 3 "enforceEnvConsistency" frontend/src/App.tsx | grep -q "useEffect"; then
  echo -e "${GREEN}✓${NC} Web App.tsx chama enforceEnvConsistency no useEffect"
else
  echo -e "${YELLOW}⚠${NC} Web App.tsx pode não estar chamando enforceEnvConsistency corretamente"
fi

# Mobile App.tsx deve chamar enforceEnvConsistency no useEffect
if grep -A 3 "enforceEnvConsistency" frontend/App.tsx | grep -q "useEffect"; then
  echo -e "${GREEN}✓${NC} Mobile App.tsx chama enforceEnvConsistency no useEffect"
else
  echo -e "${YELLOW}⚠${NC} Mobile App.tsx pode não estar chamando enforceEnvConsistency corretamente"
fi

echo ""

# Teste 5: Verificar lógica de URL normalization
echo "5️⃣  Verificando lógica..."

# Verificar se há normalização de URL (remove trailing slash)
if grep -q "replace(/\/\$/, '')" frontend/src/utils/envGuard.ts; then
  echo -e "${GREEN}✓${NC} Web: URL normalization implementada"
else
  echo -e "${RED}✗${NC} Web: URL normalization não encontrada"
fi

if grep -q "replace(/\/\$/, '')" frontend/utils/envGuard.ts; then
  echo -e "${GREEN}✓${NC} Mobile: URL normalization implementada"
else
  echo -e "${RED}✗${NC} Mobile: URL normalization não encontrada"
fi

# Verificar se há parseJwtIssuer no mobile
if grep -q "parseJwtIssuer" frontend/utils/envGuard.ts; then
  echo -e "${GREEN}✓${NC} Mobile: JWT parsing implementado"
else
  echo -e "${RED}✗${NC} Mobile: JWT parsing não encontrado"
fi

echo ""

# Teste 6: Verificar TypeScript compilation
echo "6️⃣  Verificando compilação TypeScript..."

if npx tsc --noEmit --project frontend/tsconfig.json 2>&1 | grep -q "error TS"; then
  echo -e "${RED}✗${NC} Erros de TypeScript encontrados"
  npx tsc --noEmit --project frontend/tsconfig.json 2>&1 | grep "error TS" | head -5
else
  echo -e "${GREEN}✓${NC} Sem erros de TypeScript"
fi

echo ""

# Resumo
echo "=========================================="
echo -e "${GREEN}✅ Testes concluídos!${NC}"
echo ""
echo "📋 Próximos passos para testar manualmente:"
echo "  1. Abra o app web e verifique o console"
echo "  2. Mude as variáveis de ambiente e recarregue"
echo "  3. Verifique se a sessão é limpa automaticamente"
echo "  4. Teste com token inválido (401) e veja se limpa"
echo ""

