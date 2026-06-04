# 🚀 Guia Rápido - Configuração Local do PetMi Vet

Este guia mostra como configurar e rodar o projeto PetMi Vet na sua máquina local.

## 📋 Pré-requisitos

- Node.js 18+ instalado
- npm 9+ instalado
- Conta no Supabase (criar em https://app.supabase.com)
- Git instalado

## 🔧 Passo 1: Clonar o Repositório

```bash
git clone <repository-url>
cd PetiMiUniverse
```

## 📦 Passo 2: Instalar Dependências

```bash
# Na raiz do monorepo (instala backend, frontend, apps/hub-web e packages)
npm install
```

## 🔑 Passo 3: Configurar Variáveis de Ambiente

### 3.1 Backend

Crie um arquivo `.env` em `backend/.env`:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

**Onde encontrar as credenciais:**
1. Acesse https://app.supabase.com
2. Selecione seu projeto
3. Vá em **Settings → API**
4. Copie:
   - **Project URL** → `SUPABASE_URL`
   - **anon/public key** → `SUPABASE_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

### 3.2 Frontend

Crie um arquivo `.env.local` em `frontend/.env.local`:

```env
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
REACT_APP_API_URL=http://localhost:3000
# Opcional: URL da app PetMi Hub (Vite, porta 3002 por defeito) para os links do menu abrirem o Hub noutro host
REACT_APP_HUB_WEB_URL=http://localhost:3002
```

### 3.3 PetMi Hub (app web separada)

Na raiz do monorepo, após `npm install`, crie `apps/hub-web/.env.local`:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=http://localhost:3000
VITE_VET_WEB_URL=http://localhost:3001
```

Use as mesmas credenciais Supabase do backend. `VITE_VET_WEB_URL` é opcional (links «PetMi Vet» e redirecionamentos quando o papel não é staff de clínica no Hub).

⚠️ **Importante**: Use as mesmas credenciais do Supabase configuradas no backend.

## 🗄️ Passo 4: Configurar Banco de Dados

1. Acesse o SQL Editor do seu projeto no Supabase Dashboard
2. Execute os arquivos SQL em `backend/database_migrations/petimi_vet/` (e `petimi_hub/` se usar Hub) em ordem
3. Verifique se as tabelas foram criadas corretamente

> 💡 **Dica**: Execute primeiro os arquivos base do schema e depois as migrations específicas.

## 🏃 Passo 5: Rodar o Projeto

Abra **dois ou três terminais** (backend, Vet web, opcionalmente Hub web):

### Terminal 1 - Backend

```bash
cd backend
npm run dev
```

O backend estará rodando em: **http://localhost:3000**

### Terminal 2 - PetMi Vet (web)

```bash
cd frontend
npm run web
```

Por defeito a web Vet usa a porta **3001** (ver `frontend/package.json`).

### Terminal 3 (opcional) - PetMi Hub

Na raiz do repositório:

```bash
npm run dev:hub-web
```

A app Hub sobe em **http://localhost:3002**. A sessão é independente da app Vet (origem diferente); faça login também no Hub se precisar de testar só o Hub.

## ✅ Verificação

1. **Backend**: Acesse http://localhost:3000 — deve responder à API
2. **PetMi Vet (web)**: http://localhost:3001 (script `npm run web` em `frontend/`)
3. **PetMi Hub (web)**: http://localhost:3002 (`npm run dev:hub-web` na raiz)

## 📱 Testando no Dispositivo Móvel

### iOS (macOS apenas)

```bash
cd frontend
npm run start:ios
```

**Requisitos:**
- macOS
- Xcode instalado
- Simulador iOS disponível

### Android

```bash
cd frontend
npm run start:android
```

**Requisitos:**
- Android Studio instalado
- Emulador rodando OU dispositivo físico conectado via USB

**⚠️ Importante para dispositivos físicos:**

1. Ative o modo desenvolvedor e USB debugging no dispositivo
2. Conecte via USB
3. Verifique conexão: `adb devices`
4. **ATUALIZE** `REACT_APP_API_URL` em `frontend/.env.local`:
   - Troque `localhost` pelo IP da sua máquina na rede local
   - Exemplo: `http://192.168.1.100:3000`

## 🐛 Problemas Comuns

### Erro de conexão com Supabase
- Verifique se as variáveis de ambiente estão corretas
- Confirme que as credenciais estão no formato correto (sem espaços extras)

### Frontend não conecta com backend
- Certifique-se de que ambos estão rodando
- Verifique se a porta 3000 está livre
- Para dispositivos móveis, use o IP da máquina em vez de `localhost`

### Erros de TypeScript
- Execute `npm install` novamente no diretório com erro
- Limpe cache: `rm -rf node_modules package-lock.json && npm install`

### Porta já em uso
- Backend: Altere `PORT` no `.env` do backend
- Frontend: O Expo escolhe automaticamente outra porta se necessário

## 📚 Comandos Úteis

### Backend
```bash
npm run dev        # Desenvolvimento (auto-reload)
npm run build      # Compilar TypeScript
npm start          # Produção (após build)
```

### Frontend
```bash
npm start              # Servidor Expo
npm run start:web      # Apenas web
npm run start:ios      # iOS
npm run start:android  # Android
npm run build:web      # Build produção web
```

## 🎉 Pronto!

Se tudo deu certo, você deve conseguir:
- ✅ Ver o backend rodando em http://localhost:3000
- ✅ Acessar o frontend web ou mobile
- ✅ Fazer login/cadastro de usuários
- ✅ Usar todas as funcionalidades do sistema

Para mais detalhes, consulte o [README.md](README.md).

