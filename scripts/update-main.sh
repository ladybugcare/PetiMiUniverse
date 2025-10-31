#!/bin/bash

# Script para atualizar main com os commits de staging
# Este é o workflow correto: staging → main (nunca main → staging)

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Atualizando main com staging...${NC}"
echo ""

# Verifica se está em staging
current_branch=$(git branch --show-current)
if [ "$current_branch" != "staging" ]; then
    echo -e "${YELLOW}⚠️  Você não está em staging. Mudando para staging...${NC}"
    git checkout staging
fi

# Atualiza staging do remoto
echo -e "${BLUE}📥 Atualizando staging do remoto...${NC}"
git pull origin staging

# Verifica se há commits novos em staging que não estão em main
commits_ahead=$(git rev-list --count origin/main..staging 2>/dev/null || echo "0")

if [ "$commits_ahead" -eq 0 ]; then
    echo -e "${GREEN}✅ Main já está atualizada com staging. Nada para fazer!${NC}"
    exit 0
fi

echo -e "${BLUE}📊 Encontrados ${commits_ahead} commit(s) em staging que não estão em main${NC}"
echo ""
git log --oneline origin/main..staging
echo ""

# Confirmação
read -p "Deseja atualizar main com esses commits? (yes/no): " -r
echo
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo -e "${YELLOW}❌ Operação cancelada.${NC}"
    exit 0
fi

# Muda para main
echo -e "${BLUE}🔀 Mudando para main...${NC}"
git checkout main

# Atualiza main do remoto
echo -e "${BLUE}📥 Atualizando main do remoto...${NC}"
git pull origin main

# Faz merge de staging em main
echo -e "${BLUE}🔀 Fazendo merge de staging em main...${NC}"
if git merge staging --no-edit; then
    echo -e "${GREEN}✅ Merge concluído com sucesso!${NC}"
else
    echo -e "${RED}❌ Erro no merge. Resolva os conflitos e tente novamente.${NC}"
    exit 1
fi

# Push para main
read -p "Deseja fazer push para main agora? (yes/no): " -r
echo
if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo -e "${BLUE}📤 Fazendo push para main...${NC}"
    git push origin main
    echo -e "${GREEN}✅ Push concluído!${NC}"
else
    echo -e "${YELLOW}⚠️  Push não realizado. Faça manualmente quando estiver pronto.${NC}"
fi

# Volta para staging
echo -e "${BLUE}🔀 Voltando para staging...${NC}"
git checkout staging

echo ""
echo -e "${GREEN}🎉 Processo concluído!${NC}"
echo -e "${BLUE}📌 Você está de volta em staging.${NC}"

