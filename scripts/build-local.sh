#!/bin/bash

# Script para build local - iOS e Android
# Uso: ./scripts/build-local.sh [ios|android|all]

set -e  # Para se erro ocorrer, parar execução

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PLATFORM=${1:-all}
FRONTEND_DIR="frontend"

echo -e "${GREEN}🚀 Iniciando build local...${NC}"

# Verificar se está na raiz do projeto
if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}❌ Erro: Execute este script da raiz do projeto PetMi Vet${NC}"
    exit 1
fi

cd "$FRONTEND_DIR"

# Verificar se node_modules existe
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  node_modules não encontrado. Instalando dependências...${NC}"
    npm install
fi

# Função para build iOS
build_ios() {
    echo -e "${GREEN}📱 Building iOS...${NC}"
    
    # Verificar se está no macOS
    if [[ "$OSTYPE" != "darwin"* ]]; then
        echo -e "${RED}❌ iOS build requer macOS${NC}"
        return 1
    fi
    
    # Verificar se Xcode está instalado
    if ! command -v xcodebuild &> /dev/null; then
        echo -e "${RED}❌ Xcode não encontrado. Instale o Xcode da App Store.${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}⚙️  Instalando dependências nativas...${NC}"
    npx expo run:ios
    
    echo -e "${GREEN}✅ Build iOS concluído!${NC}"
}

# Função para build Android
build_android() {
    echo -e "${GREEN}🤖 Building Android...${NC}"
    
    # Verificar se ANDROID_HOME está configurado
    if [ -z "$ANDROID_HOME" ]; then
        echo -e "${YELLOW}⚠️  ANDROID_HOME não configurado. Tentando detectar...${NC}"
        if [ -d "$HOME/Library/Android/sdk" ]; then
            export ANDROID_HOME="$HOME/Library/Android/sdk"
        elif [ -d "$HOME/Android/Sdk" ]; then
            export ANDROID_HOME="$HOME/Android/Sdk"
        else
            echo -e "${RED}❌ ANDROID_HOME não encontrado. Configure as variáveis de ambiente.${NC}"
            return 1
        fi
    fi
    
    # Verificar se adb está disponível
    if ! command -v adb &> /dev/null; then
        echo -e "${RED}❌ Android SDK não encontrado. Instale o Android Studio.${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}⚙️  Instalando dependências nativas...${NC}"
    npx expo run:android
    
    echo -e "${GREEN}✅ Build Android concluído!${NC}"
}

# Executar builds
case $PLATFORM in
    ios)
        build_ios
        ;;
    android)
        build_android
        ;;
    all)
        build_ios || true
        echo ""
        build_android || true
        ;;
    *)
        echo -e "${RED}❌ Plataforma inválida: $PLATFORM${NC}"
        echo "Uso: ./scripts/build-local.sh [ios|android|all]"
        exit 1
        ;;
esac

echo -e "${GREEN}✨ Processo concluído!${NC}"

