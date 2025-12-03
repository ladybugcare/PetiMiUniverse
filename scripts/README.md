# 🚀 Scripts de Build Automatizado

Scripts para facilitar o processo de build local e de preview/teste.

## 📋 Scripts Disponíveis

### 1. `setup-build.sh`

Script de setup inicial que verifica e configura tudo automaticamente.

**Uso:**
```bash
./scripts/setup-build.sh
```

**O que faz:**
- Verifica Node.js e npm
- Instala dependências do backend e frontend
- Verifica arquivos de configuração (app.json, eas.json)
- Verifica variáveis de ambiente
- Verifica EAS CLI

**Quando usar:**
- Primeira vez configurando o projeto
- Após clonar o repositório
- Quando precisar verificar se tudo está configurado

---

### 2. `build-local.sh`

Script para build local (iOS e Android).

**Uso:**
```bash
# Build iOS (apenas macOS)
./scripts/build-local.sh ios

# Build Android
./scripts/build-local.sh android

# Build ambos
./scripts/build-local.sh all
```

**O que faz:**
- Verifica pré-requisitos (Xcode, Android SDK)
- Instala dependências nativas
- Executa build local
- Abre no simulador/dispositivo

**Requisitos:**
- **iOS**: macOS + Xcode instalado
- **Android**: Android Studio + SDK configurado

**Quando usar:**
- Para desenvolvimento e testes rápidos
- Quando quiser buildar sem usar a nuvem
- Para iterar rapidamente no código

---

### 3. `build-preview.sh`

Script para build de preview/teste usando EAS Build.

**Uso:**
```bash
# Build iOS Preview
./scripts/build-preview.sh ios

# Build Android Preview (APK)
./scripts/build-preview.sh android

# Build ambos
./scripts/build-preview.sh all
```

**O que faz:**
- Verifica login no Expo
- Configura EAS se necessário
- Executa build na nuvem
- Retorna link para download

**Primeira vez:**
- Solicita login no Expo (se não estiver logado)
- Configura `eas.json` se necessário

**Quando usar:**
- Para gerar APK/IPA de teste
- Para distribuir versões de teste
- Para testar em dispositivos físicos
- Quando não tem as ferramentas instaladas localmente

---

## 🔧 Tornar Scripts Executáveis

Se os scripts não estiverem executáveis, rode:

```bash
chmod +x scripts/*.sh
```

---

## 🐛 Problemas Comuns

### "Permission denied"

```bash
chmod +x scripts/build-local.sh
chmod +x scripts/build-preview.sh
chmod +x scripts/setup-build.sh
```

### "Command not found: eas"

```bash
npm install -g eas-cli
```

### Script não encontra diretórios

Certifique-se de executar os scripts da raiz do projeto:
```bash
cd /caminho/para/PetiVet
./scripts/build-local.sh android
```

---

## 📚 Workflow Recomendado

### Primeira Vez

1. Execute o setup:
   ```bash
   ./scripts/setup-build.sh
   ```

2. Configure variáveis de ambiente (`.env` e `.env.local`)

3. Para testar localmente:
   ```bash
   ./scripts/build-local.sh android
   ```

4. Para gerar APK de teste:
   ```bash
   ./scripts/build-preview.sh android
   ```

### Desenvolvimento Contínuo

- **Testes rápidos**: Use `build-local.sh`
- **Versões de teste**: Use `build-preview.sh`
- **Verificar setup**: Use `setup-build.sh` periodicamente

---

## 💡 Dicas

- Os scripts mostram mensagens coloridas para facilitar o acompanhamento
- Erros são exibidos em vermelho
- Avisos são exibidos em amarelo
- Sucesso é exibido em verde

Para mais detalhes sobre builds, consulte [BUILD_MOBILE.md](../BUILD_MOBILE.md).










