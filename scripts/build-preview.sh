#!/bin/bash

# Script para build de preview/teste usando EAS Build
# Uso: ./scripts/build-preview.sh [ios|android|all]

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PLATFORM=${1:-all}
FRONTEND_DIR="frontend"

echo -e "${GREEN}🚀 Iniciando build de preview/teste...${NC}"

# Verificar se está na raiz do projeto
if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}❌ Erro: Execute este script da raiz do projeto PetMi Vet${NC}"
    exit 1
fi

cd "$FRONTEND_DIR"

# Verificar se EAS CLI está instalado
if ! command -v eas &> /dev/null; then
    echo -e "${YELLOW}⚠️  EAS CLI não encontrado. Instalando...${NC}"
    npm install -g eas-cli
fi

# Verificar se está logado no Expo
echo -e "${BLUE}🔍 Verificando login no Expo...${NC}"
if ! eas whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  Não está logado no Expo. Fazendo login...${NC}"
    echo -e "${YELLOW}💡 Você precisará inserir suas credenciais do Expo${NC}"
    eas login
fi

# Verificar se eas.json existe
if [ ! -f "eas.json" ]; then
    echo -e "${YELLOW}⚠️  eas.json não encontrado. Configurando...${NC}"
    eas build:configure
fi

# Verificar se app.json existe
if [ ! -f "app.json" ]; then
    echo -e "${RED}❌ app.json não encontrado. Criando...${NC}"
    if [ -f "app.json.expo" ]; then
        cp app.json.expo app.json
        echo -e "${GREEN}✅ app.json criado a partir de app.json.expo${NC}"
    else
        echo -e "${RED}❌ app.json.expo também não encontrado. Configure manualmente.${NC}"
        exit 1
    fi
fi

# Função para build iOS preview
build_ios_preview() {
    echo -e "${GREEN}📱 Building iOS Preview...${NC}"
    echo -e "${BLUE}ℹ️  Isso gerará um arquivo para simulador iOS${NC}"
    
    eas build --platform ios --profile preview --non-interactive
    
    echo -e "${GREEN}✅ Build iOS Preview concluído!${NC}"
    echo -e "${YELLOW}💡 Verifique o link fornecido para baixar o arquivo${NC}"
}

# Função para build Android preview
build_android_preview() {
    echo -e "${GREEN}🤖 Building Android Preview...${NC}"
    echo -e "${BLUE}ℹ️  Isso gerará um arquivo APK para instalação${NC}"
    
    eas build --platform android --profile preview --non-interactive
    
    echo -e "${GREEN}✅ Build Android Preview concluído!${NC}"
    echo -e "${YELLOW}💡 Verifique o link fornecido para baixar o APK${NC}"
}

# Executar builds
case $PLATFORM in
    ios)
        build_ios_preview
        ;;
    android)
        build_android_preview
        ;;
    all)
        build_ios_preview || true
        echo ""
        build_android_preview || true
        ;;
    *)
        echo -e "${RED}❌ Plataforma inválida: $PLATFORM${NC}"
        echo "Uso: ./scripts/build-preview.sh [ios|android|all]"
        exit 1
        ;;
esac

echo -e "${GREEN}✨ Processo concluído!${NC}"
echo -e "${BLUE}📋 Para ver todos os builds: eas build:list${NC}"










