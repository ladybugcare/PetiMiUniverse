#!/bin/bash

# Script para instalar todas as dependências necessárias do React Navigation e Expo
# Uso: ./scripts/fix-dependencies.sh

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

FRONTEND_DIR="frontend"

echo -e "${GREEN}🔧 Instalando dependências necessárias...${NC}"

# Verificar se está na raiz do projeto
if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}❌ Erro: Execute este script da raiz do projeto PetiVet${NC}"
    exit 1
fi

cd "$FRONTEND_DIR"

# Matar processo na porta 8081 se existir
echo -e "${BLUE}🔍 Liberando porta 8081...${NC}"
lsof -ti:8081 | xargs kill -9 2>/dev/null || true

# Instalar dependências do React Navigation
echo -e "${YELLOW}📦 Instalando React Navigation...${NC}"
npm install --legacy-peer-deps \
    @react-navigation/native \
    @react-navigation/native-stack \
    react-native-safe-area-context \
    expo-linking

# Instalar dependências nativas do Expo
echo -e "${YELLOW}📦 Instalando dependências nativas do Expo...${NC}"
npx expo install react-native-screens react-native-gesture-handler

echo -e "${GREEN}✅ Dependências instaladas!${NC}"
echo ""
echo -e "${BLUE}🚀 Reiniciando Expo...${NC}"
echo -e "${YELLOW}💡 Execute: npx expo start --ios${NC}"



