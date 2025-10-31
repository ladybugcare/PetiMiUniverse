# 📱 Guia de Build Mobile - iOS e Android

Este guia mostra como buildar os aplicativos iOS e Android do PetiVet usando EAS Build (recomendado) ou build local.

## 📋 Índice

1. [Pré-requisitos e Setup de Contas](#pré-requisitos-e-setup-de-contas)
2. [Configuração Inicial do Projeto](#configuração-inicial-do-projeto)
3. [⚡ Build Automatizado (Recomendado)](#-build-automatizado-recomendado)
4. [☁️ Build com EAS Build (Manual)](#️-build-com-eas-build-manual)
5. [💻 Build Local (Manual)](#-build-local-manual)
6. [Troubleshooting](#troubleshooting)

---

## 🔑 Pré-requisitos e Setup de Contas

### 1. Conta Expo (Gratuita)

1. Acesse https://expo.dev
2. Clique em **Sign Up** e crie uma conta gratuita
3. Anote seu email e senha para usar no login

### 2. Apple Developer Account (Para iOS - $99/ano)

**Importante**: Necessário apenas se você quer buildar para dispositivos físicos iOS ou publicar na App Store. Para simulador iOS, não é necessário.

1. Acesse https://developer.apple.com/programs/
2. Clique em **Enroll**
3. Escolha **Individual** ou **Organization**
4. Complete o cadastro e pague a taxa de $99 USD/ano
5. Aguarde aprovação (pode levar alguns dias)

**Nota**: Para apenas testar no simulador iOS, você pode pular esta etapa e usar EAS Build sem certificados.

### 3. Google Play Developer Account (Para Android - $25 única vez)

**Importante**: Necessário apenas se você quer publicar na Google Play Store. Para gerar APKs de teste, não é necessário.

1. Acesse https://play.google.com/console/signup
2. Clique em **Get Started**
3. Pague a taxa única de $25 USD
4. Complete o cadastro com dados da sua organização

**Nota**: Para gerar APKs para distribuição interna/testes, você não precisa de conta na Google Play.

### 4. Instalar EAS CLI

```bash
npm install -g eas-cli
```

Verifique a instalação:
```bash
eas --version
```

---

## ⚙️ Configuração Inicial do Projeto

### 1. Verificar/Criar app.json

O projeto deve ter um arquivo `app.json` na raiz do `frontend/`. Se não existir, crie baseado no `app.json.expo`:

```json
{
  "expo": {
    "name": "PetiVet",
    "slug": "petivet",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.petivet.app"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "com.petivet.app"
    }
  }
}
```

**Campos importantes:**
- `slug`: Identificador único do app (use apenas letras, números e hífens)
- `bundleIdentifier` (iOS): Deve ser único (formato: com.suaempresa Domain.appname)
- `package` (Android): Mesmo formato do bundleIdentifier

### 2. Criar eas.json

Na pasta `frontend/`, crie o arquivo `eas.json`:

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      },
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "ios": {
        "simulator": false
      },
      "android": {
        "buildType": "aab"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

**Perfis de build:**
- `development`: Para desenvolvimento com Expo Go
- `preview`: Para testar em dispositivos (APK para Android, IPA para iOS)
- `production`: Para publicação nas lojas (AAB para Android, IPA assinado para iOS)

---

## ⚡ Build Automatizado (Recomendado)

Para facilitar o processo, criamos scripts que automatizam os builds locais e de preview/teste.

### 1. Setup Inicial (Primeira Vez)

Execute o script de setup para verificar e configurar tudo automaticamente:

```bash
./scripts/setup-build.sh
```

Este script irá:
- ✅ Verificar Node.js e npm
- ✅ Instalar dependências (se necessário)
- ✅ Verificar arquivos de configuração
- ✅ Configurar o ambiente

### 2. Build Local Automatizado

Para buildar localmente (requer Xcode para iOS ou Android Studio para Android):

```bash
# Build iOS
./scripts/build-local.sh ios

# Build Android
./scripts/build-local.sh android

# Build ambos
./scripts/build-local.sh all
```

**O que faz:**
- ✅ Verifica pré-requisitos automaticamente
- ✅ Instala dependências nativas
- ✅ Executa o build
- ✅ Abre no simulador/dispositivo

### 3. Build Preview/Teste Automatizado (EAS)

Para buildar APK/IPA de teste usando EAS Build (na nuvem):

```bash
# Build iOS Preview
./scripts/build-preview.sh ios

# Build Android Preview (APK)
./scripts/build-preview.sh android

# Build ambos
./scripts/build-preview.sh all
```

**O que faz:**
- ✅ Verifica se está logado no Expo
- ✅ Configura EAS se necessário
- ✅ Executa build na nuvem
- ✅ Retorna link para download

**Primeira vez:**
- Se não estiver logado, o script pedirá suas credenciais do Expo
- Configure `eas.json` se necessário (o script pode fazer isso)

**Após o build:**
- Você receberá um link para baixar o arquivo
- Para iOS: arquivo `.tar.gz` para simulador ou `.ipa` para dispositivo
- Para Android: arquivo `.apk` pronto para instalação

### 4. Listar Builds Realizados

```bash
cd frontend
eas build:list
```

---

## ☁️ Build com EAS Build (Manual)

O EAS Build faz o build na nuvem, então você não precisa ter Xcode ou Android Studio instalados.

### 1. Login no Expo

```bash
cd frontend
eas login
```

Digite o email e senha da sua conta Expo.

### 2. Configurar Projeto

Na primeira vez, você precisa associar o projeto à sua conta:

```bash
eas build:configure
```

Isso irá:
- Criar o arquivo `eas.json` se não existir
- Fazer algumas perguntas sobre configuração
- Configurar o projeto no Expo

### 3. Build para iOS

#### iOS Simulator (Para teste local - Gratuito)

```bash
eas build --platform ios --profile preview --local
```

**Ou build na nuvem (mais fácil):**

```bash
eas build --platform ios --profile preview
```

Você receberá um link para baixar o arquivo `.tar.gz` que contém o app para simulador.

**Como instalar no simulador:**
1. Extraia o arquivo `.tar.gz`
2. Abra o simulador iOS (Xcode → Open Developer Tool → Simulator)
3. Arraste o arquivo `.app` para o simulador

#### iOS Device (Para dispositivos físicos - Requer Apple Developer)

```bash
eas build --platform ios --profile production
```

**Primeira vez:**
- O EAS irá pedir suas credenciais Apple Developer
- Você pode deixar o EAS gerenciar os certificados automaticamente
- Ou fornecer seus próprios certificados

Após o build, você receberá um link para baixar o arquivo `.ipa`.

**Como instalar em dispositivo físico:**
1. Baixe o arquivo `.ipa`
2. Use **TestFlight** (recomendado) ou **AltStore/Xcode**

### 4. Build para Android

#### Android APK (Para testes e distribuição interna)

```bash
eas build --platform android --profile preview
```

Você receberá um link para baixar o arquivo `.apk`.

**Como instalar:**
1. Baixe o arquivo `.apk` no seu dispositivo Android
2. Permita instalação de fontes desconhecidas nas configurações
3. Abra o arquivo `.apk` para instalar

#### Android AAB (Para Google Play Store)

```bash
eas build --platform android --profile production
```

Você receberá um link para baixar o arquivo `.aab` (Android App Bundle).

**Nota**: O arquivo `.aab` é usado apenas para upload na Google Play, não pode ser instalado diretamente.

### 5. Build para Ambas as Plataformas

```bash
eas build --platform all --profile preview
```

### 6. Monitorar Build

Durante o build, você pode:

- Acompanhar o progresso no terminal
- Abrir o link fornecido no navegador para ver logs detalhados
- Cancelar um build: `eas build:cancel`

### 7. Listar Builds

```bash
eas build:list
```

Mostra todos os builds realizados.

---

## 💻 Build Local (Manual)

Build local requer ter as ferramentas instaladas na sua máquina.

### Requisitos iOS (macOS apenas)

- macOS
- Xcode instalado (baixe da App Store)
- Xcode Command Line Tools: `xcode-select --install`
- CocoaPods: `sudo gem install cocoapods`

### Requisitos Android

- Android Studio instalado
- Android SDK configurado
- Variável de ambiente `ANDROID_HOME` configurada
- Java JDK instalado

### 1. Build iOS Local

#### Para Simulador

```bash
cd frontend
npx expo run:ios
```

Isso irá:
- Instalar dependências nativas
- Compilar o projeto
- Abrir no simulador automaticamente

#### Para Dispositivo Físico

```bash
cd frontend
npx expo run:ios --device
```

Você precisará:
1. Ter seu dispositivo conectado via USB
2. Ter confiança no computador habilitada no dispositivo
3. Ter um Apple Developer Account e certificados configurados no Xcode

### 2. Build Android Local

#### Para Emulador ou Dispositivo

```bash
cd frontend
npx expo run:android
```

Isso irá:
- Instalar dependências nativas
- Compilar o projeto
- Tentar detectar e instalar em emulador/dispositivo conectado

#### Gerar APK Manualmente

```bash
cd frontend/android
./gradlew assembleRelease
```

O APK estará em: `frontend/android/app/build/outputs/apk/release/app-release.apk`

#### Gerar AAB Manualmente

```bash
cd frontend/android
./gradlew bundleRelease
```

O AAB estará em: `frontend/android/app/build/outputs/bundle/release/app-release.aab`

**Nota**: Para builds locais, você precisa ter configurado as assinaturas (keystores) corretamente.

---

## 🐛 Troubleshooting

### EAS Build

**Problema**: "No credentials found"

**Solução**: 
- Para iOS, configure as credenciais: `eas credentials`
- Para Android, o EAS gerencia automaticamente, mas você pode configurar manualmente

**Problema**: Build falha com erro de dependências

**Solução**:
- Limpe cache: `eas build --clear-cache`
- Verifique se todas as dependências estão no `package.json`

**Problema**: Erro de permissões no iOS

**Solução**:
- Verifique se o `bundleIdentifier` está correto no `app.json`
- Certifique-se de ter aceito os termos do Apple Developer

### Build Local iOS

**Problema**: "Command not found: pod"

**Solução**:
```bash
sudo gem install cocoapods
cd frontend/ios
pod install
```

**Problema**: Erro de assinatura

**Solução**:
- Abra o projeto no Xcode: `open frontend/ios/PetiVet.xcworkspace`
- Vá em Signing & Capabilities
- Selecione seu time de desenvolvimento

### Build Local Android

**Problema**: "SDK location not found"

**Solução**:
```bash
# Adicione ao ~/.bashrc ou ~/.zshrc
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

**Problema**: Erro de Gradle

**Solução**:
```bash
cd frontend/android
./gradlew clean
./gradlew --stop
```

**Problema**: Dispositivo não detectado

**Solução**:
```bash
# Verificar dispositivos conectados
adb devices

# Se não aparecer, verifique:
# - USB debugging está habilitado
# - Cable USB está funcionando
# - Drivers USB instalados (Windows)
```

### Problemas Gerais

**Limpar cache do Expo:**
```bash
npx expo start --clear
```

**Limpar node_modules e reinstalar:**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Verificar versão do Expo:**
```bash
npx expo --version
```

---

## 📚 Referências

- [Documentação EAS Build](https://docs.expo.dev/build/introduction/)
- [Documentação Expo](https://docs.expo.dev/)
- [Apple Developer](https://developer.apple.com/)
- [Google Play Console](https://play.google.com/console/)

---

## ✅ Checklist Rápido

### Para Build com EAS:
- [ ] Conta Expo criada
- [ ] EAS CLI instalado
- [ ] `eas login` executado
- [ ] `eas.json` configurado
- [ ] `app.json` com bundleIdentifier/package correto

### Para Build iOS Local:
- [ ] macOS instalado
- [ ] Xcode instalado
- [ ] CocoaPods instalado
- [ ] Apple Developer Account (para dispositivos físicos)

### Para Build Android Local:
- [ ] Android Studio instalado
- [ ] Android SDK configurado
- [ ] ANDROID_HOME configurado
- [ ] Dispositivo/Emulador configurado

---

**Boa sorte com seus builds!** 🚀

