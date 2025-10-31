#!/bin/bash

# Script de setup automático para builds
# Verifica pré-requisitos e configura o ambiente

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

FRONTEND_DIR="frontend"
BACKEND_DIR="backend"

echo -e "${BLUE}🔍 Verificando pré-requisitos...${NC}"
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js não encontrado. Instale Node.js 18+ de https://nodejs.org${NC}"
    exit 1
else
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✅ Node.js: $NODE_VERSION${NC}"
fi

# Verificar npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm não encontrado${NC}"
    exit 1
else
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✅ npm: $NPM_VERSION${NC}"
fi

# Verificar se está na raiz do projeto
if [ ! -d "$FRONTEND_DIR" ] || [ ! -d "$BACKEND_DIR" ]; then
    echo -e "${RED}❌ Erro: Execute este script da raiz do projeto PetiVet${NC}"
    exit 1
fi

# Verificar dependências do backend
echo ""
echo -e "${BLUE}📦 Verificando dependências do backend...${NC}"
if [ ! -d "$BACKEND_DIR/node_modules" ]; then
    echo -e "${YELLOW}⚠️  Instalando dependências do backend...${NC}"
    cd "$BACKEND_DIR"
    npm install
    cd ..
else
    echo -e "${GREEN}✅ Dependências do backend OK${NC}"
fi

# Verificar dependências do frontend
echo ""
echo -e "${BLUE}📦 Verificando dependências do frontend...${NC}"
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo -e "${YELLOW}⚠️  Instalando dependências do frontend...${NC}"
    cd "$FRONTEND_DIR"
    npm install
    cd ..
else
    echo -e "${GREEN}✅ Dependências do frontend OK${NC}"
fi

# Verificar arquivos de configuração
echo ""
echo -e "${BLUE}⚙️  Verificando configurações...${NC}"

cd "$FRONTEND_DIR"

# Verificar app.json
if [ ! -f "app.json" ]; then
    echo -e "${YELLOW}⚠️  app.json não encontrado${NC}"
    if [ -f "app.json.expo" ]; then
        echo -e "${YELLOW}📝 Copiando app.json.expo para app.json...${NC}"
        cp app.json.expo app.json
        echo -e "${GREEN}✅ app.json criado${NC}"
    else
        echo -e "${RED}❌ app.json.expo também não encontrado${NC}"
    fi
else
    echo -e "${GREEN}✅ app.json encontrado${NC}"
fi

# Verificar eas.json
if [ ! -f "eas.json" ]; then
    echo -e "${YELLOW}⚠️  eas.json não encontrado${NC}"
    echo -e "${YELLOW}💡 Execute 'eas build:configure' ou use o template fornecido${NC}"
else
    echo -e "${GREEN}✅ eas.json encontrado${NC}"
fi

# Verificar EAS CLI (opcional para builds locais)
echo ""
echo -e "${BLUE}🔧 Verificando EAS CLI (para builds de preview)...${NC}"
if command -v eas &> /dev/null; then
    EAS_VERSION=$(eas --version)
    echo -e "${GREEN}✅ EAS CLI: $EAS_VERSION${NC}"
else
    echo -e "${YELLOW}⚠️  EAS CLI não instalado${NC}"
    echo -e "${YELLOW}💡 Para builds de preview, instale com: npm install -g eas-cli${NC}"
fi

# Verificar variáveis de ambiente (backend)
cd ..
echo ""
echo -e "${BLUE}🔑 Verificando variáveis de ambiente...${NC}"
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo -e "${YELLOW}⚠️  backend/.env não encontrado${NC}"
    echo -e "${YELLOW}💡 Crie o arquivo .env baseado em backend/ENV_SETUP.md${NC}"
else
    echo -e "${GREEN}✅ backend/.env encontrado${NC}"
fi

# Verificar variáveis de ambiente (frontend)
if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
    echo -e "${YELLOW}⚠️  frontend/.env.local não encontrado${NC}"
    echo -e "${YELLOW}💡 Crie o arquivo .env.local baseado em frontend/ENV_SETUP.md${NC}"
else
    echo -e "${GREEN}✅ frontend/.env.local encontrado${NC}"
fi

echo ""
echo -e "${GREEN}✨ Setup concluído!${NC}"
echo ""
echo -e "${BLUE}📚 Próximos passos:${NC}"
echo -e "  • Para build local: ./scripts/build-local.sh [ios|android|all]"
echo -e "  • Para build preview: ./scripts/build-preview.sh [ios|android|all]"
echo ""

