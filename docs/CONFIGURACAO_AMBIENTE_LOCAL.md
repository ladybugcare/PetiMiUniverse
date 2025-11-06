# 🚀 Configuração de Ambiente Local - PetiVet

Este guia consolida todas as informações necessárias para configurar o ambiente local do PetiVet com Supabase local via Docker, incluindo configuração de variáveis de ambiente e CORS.

## 📋 Visão Geral

**Ambiente Local:**
- **Backend**: Porta 3000 (`http://localhost:3000`)
- **Frontend**: Portas 3001 ou 3002 (`http://localhost:3001` ou `http://localhost:3002`)
- **Supabase Local**: Porta 54321 (`http://127.0.0.1:54321`) via Docker

---

## 🔧 Passo 1: Configurar Supabase Local

### 1.1 Iniciar Supabase Local

```bash
# No diretório raiz do projeto
supabase start
```

### 1.2 Obter Credenciais

Após iniciar, execute:

```bash
supabase status
```

Isso mostrará todas as credenciais necessárias. Você também pode encontrar as chaves em `.supabase/.env` no diretório raiz do projeto.

**Credenciais importantes:**
- **API URL**: `http://127.0.0.1:54321`
- **anon key**: Chave pública (geralmente começa com `eyJ...`)
- **service_role key**: Chave de serviço (geralmente começa com `eyJ...`)

---

## 🔑 Passo 2: Configurar Variáveis de Ambiente

### 2.1 Backend

Crie o arquivo `backend/.env`:

```env
# Supabase Configuration (Local via Docker)
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=sua_chave_anon_aqui
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role_aqui

# Server Configuration
PORT=3000
NODE_ENV=development

# Frontend URL for CORS
# Suporta portas 3001 ou 3002 (React dev server)
FRONTEND_URL=http://localhost:3002
```

**Como obter as chaves:**
1. Execute `supabase status` após iniciar o Supabase local
2. Copie as chaves do output ou do arquivo `.supabase/.env`
3. Cole no arquivo `.env` do backend

### 2.2 Frontend

Crie o arquivo `frontend/.env.local`:

```env
# Supabase Configuration (Local via Docker)
REACT_APP_SUPABASE_URL=http://127.0.0.1:54321
REACT_APP_SUPABASE_ANON_KEY=sua_chave_anon_aqui

# Backend API URL (porta 3000)
REACT_APP_API_URL=http://localhost:3000

# Expo/Mobile Configuration
# Use as mesmas credenciais do Supabase acima
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon_aqui
EXPO_PUBLIC_API_URL=http://localhost:3000
```

**Importante:**
- Use a **mesma chave anon** do Supabase no backend e frontend
- A chave `EXPO_PUBLIC_*` é para builds mobile (Expo)
- Nunca commite arquivos `.env` ou `.env.local` no Git!

---

## 🌐 Passo 3: Configuração de CORS

### 3.1 Como Funciona

O backend está configurado para aceitar requisições das seguintes origens:

- ✅ `http://localhost:3000` - Backend local (caso frontend rode na mesma porta)
- ✅ `http://localhost:3001` - Frontend local (porta alternativa)
- ✅ `http://localhost:3002` - Frontend local (porta padrão React dev server)
- ✅ URLs de staging e produção (Vercel)
- ✅ URL configurada em `FRONTEND_URL` (variável de ambiente)

### 3.2 Verificar CORS

A configuração de CORS está em `backend/src/index.ts`. As portas 3001 e 3002 já estão configuradas e permitidas.

**Se você encontrar erros de CORS:**

1. **Verifique se o backend está rodando:**
   ```bash
   cd backend
   npm run dev
   ```
   Deve mostrar: `🐾 Server running on port 3000`

2. **Verifique se a porta do frontend está nas origens permitidas:**
   - Porta 3001: ✅ Permitida
   - Porta 3002: ✅ Permitida
   - Outras portas: Adicione em `backend/src/index.ts` se necessário

3. **Verifique as variáveis de ambiente:**
   - Backend: `FRONTEND_URL` deve estar configurada (ex: `http://localhost:3002`)
   - Frontend: `REACT_APP_API_URL` deve apontar para `http://localhost:3000`

---

## 🏃 Passo 4: Rodar o Projeto

### 4.1 Terminal 1 - Backend

```bash
cd backend
npm run dev
```

O backend estará rodando em: **http://localhost:3000**

### 4.2 Terminal 2 - Frontend

```bash
cd frontend
npm start
```

Escolha a porta quando solicitado:
- Pressione `w` para web (geralmente porta 3002)
- Ou acesse diretamente: `http://localhost:3001` ou `http://localhost:3002`

---

## ✅ Checklist de Verificação

Antes de começar a desenvolver, verifique:

- [ ] Supabase local está rodando (`supabase status` mostra serviços ativos)
- [ ] Arquivo `backend/.env` criado com todas as variáveis
- [ ] Arquivo `frontend/.env.local` criado com todas as variáveis
- [ ] Backend está rodando na porta 3000
- [ ] Frontend está rodando na porta 3001 ou 3002
- [ ] Não há erros de CORS no console do navegador
- [ ] Requisições do frontend chegam ao backend (verificar Network tab)

---

## 🐛 Troubleshooting

### Problema: Erro CORS no navegador

**Sintomas:**
```
Access to fetch at 'http://localhost:3000/...' from origin 'http://localhost:3002' 
has been blocked by CORS policy
```

**Soluções:**

1. **Verifique se o backend está rodando:**
   ```bash
   curl http://localhost:3000
   ```
   Deve retornar: `{"message":"🐾 PetiVet API is running!"}`

2. **Verifique se a porta do frontend está permitida:**
   - Abra `backend/src/index.ts`
   - Confirme que `http://localhost:3001` e `http://localhost:3002` estão na lista `allowedOrigins`

3. **Reinicie o backend:**
   ```bash
   # Pare o servidor (Ctrl+C) e inicie novamente
   cd backend
   npm run dev
   ```

4. **Limpe o cache do navegador:**
   - Chrome/Edge: `Ctrl+Shift+R` (Windows) ou `Cmd+Shift+R` (Mac)
   - Ou: DevTools → Application → Clear storage

### Problema: Variáveis de ambiente não estão sendo carregadas

**Sintomas:**
- Frontend tenta acessar `localhost:3000` mesmo com variável configurada
- Backend não encontra credenciais do Supabase

**Soluções:**

1. **Verifique o nome do arquivo:**
   - Backend: `.env` (sem extensão)
   - Frontend: `.env.local` (com extensão `.local`)

2. **Reinicie os servidores:**
   - Variáveis de ambiente são carregadas na inicialização
   - Pare e reinicie tanto o backend quanto o frontend

3. **Verifique a sintaxe:**
   - Não use espaços ao redor do `=`
   - Não use aspas (a menos que o valor contenha espaços)
   - Exemplo correto: `REACT_APP_API_URL=http://localhost:3000`
   - Exemplo errado: `REACT_APP_API_URL = "http://localhost:3000"`

### Problema: Supabase local não está acessível

**Sintomas:**
- Erro ao conectar ao Supabase
- `http://127.0.0.1:54321` não responde

**Soluções:**

1. **Verifique se o Supabase está rodando:**
   ```bash
   supabase status
   ```
   Todos os serviços devem estar "Running"

2. **Reinicie o Supabase:**
   ```bash
   supabase stop
   supabase start
   ```

3. **Verifique a porta:**
   - Padrão: `54321`
   - Se estiver usando outra porta, atualize `SUPABASE_URL` no `.env`

---

## 📝 Resumo das URLs Locais

| Componente | URL | Porta |
|------------|-----|-------|
| Backend | `http://localhost:3000` | 3000 |
| Frontend | `http://localhost:3001` ou `http://localhost:3002` | 3001/3002 |
| Supabase API | `http://127.0.0.1:54321` | 54321 |
| Supabase Studio | `http://127.0.0.1:54323` | 54323 |

---

## 🔄 Próximos Passos

Após configurar o ambiente local:

1. **Aplicar migrations do banco:**
   - Execute os arquivos SQL em `backend/database_migrations/` no Supabase Studio
   - Ou use: `supabase db reset` (cuidado: apaga dados existentes)

2. **Testar autenticação:**
   - Tente fazer signup/login no frontend
   - Verifique se os tokens são salvos corretamente

3. **Verificar integração:**
   - Teste requisições do frontend para o backend
   - Verifique logs do backend para confirmar que recebe as requisições

---

## 📚 Documentação Relacionada

- `backend/ENV_SETUP.md` - Configuração detalhada de variáveis do backend
- `frontend/ENV_SETUP.md` - Configuração detalhada de variáveis do frontend
- `docs/ENVIRONMENT_SYNC_GUIDE.md` - Guia de sincronização entre ambientes

---

**Última atualização:** 2025-01-XX  
**Status:** ✅ Configuração local completa e funcional

