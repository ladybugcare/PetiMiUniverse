#!/bin/bash

# Script para rodar o app no simulador iOS
# Uso: Etapa ./scripts/run-ios.sh

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

FRONTEND_DIR="frontend"

echo -e "${GREEN}🚀 Iniciando app no simulador iOS...${NC}"

# Verificar se está no macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}❌ iOS requer macOS${NC}"
    exit 1
fi

# Verificar se está na raiz do projeto
if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}❌ Erro: Execute este script da raiz do projeto PetiVet${NC}"
    exit 1
fi

cd "$FRONTEND_DIR"

# Verificar se node_modules existe
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  node_modules não encontrado. Instalando dependências...${NC}"
    npm install
fi

# Verificar se simulador está rodando
echo -e "${BLUE}🔍 Verificando simulador iOS...${NC}"

# Abrir simulador se não estiver aberto
if ! xcrun simctl list devices | grep -q "Booted"; then
    echo -e "${YELLOW}⚠️  Simulador não está aberto. Abrindo...${NC}"
    open -a Simulator
    sleep 5  # Aguardar simulador abrir
fi

echo -e "${GREEN}📱 Iniciando Expo e instalando app no simulador...${NC}"
echo -e "${BLUE}ℹ️  Isso pode levar alguns minutos na primeira vez${NC}"
echo ""

# Rodar o app
npx expo start --ios

echo -e "${GREEN}✅ App deve estar rodando no simulador iOS!${NC}"









