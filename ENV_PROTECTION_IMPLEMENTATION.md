# 🛡️ Implementação: Proteção de Ambientes e Sincronização

## ✅ O que foi implementado

### 1. Sistema de Environment Guard

Proteção automática contra tokens inválidos em **todos os ambientes** (local, staging, produção) para **web E mobile**.

#### Arquivos criados/modificados:

1. **`frontend/src/utils/envGuard.ts`** (Web/CRA)
   - Detecta mudança de ambiente via fingerprint armazenado no `localStorage`
   - Limpa sessão automaticamente quando detecta mudança
   - Funciona com Create React App

2. **`frontend/utils/envGuard.ts`** (Mobile/Expo)
   - Valida sessão atual verificando o issuer do JWT
   - Compara URL do token com a URL configurada
   - Limpa sessão automaticamente se não corresponder
   - Funciona com Expo/React Native

3. **`frontend/src/App.tsx`** (Web)
   - Adicionado `enforceEnvConsistency()` na inicialização
   - Protege contra tokens de ambientes diferentes

4. **`frontend/App.tsx`** (Mobile)
   - Adicionado `enforceEnvConsistency()` na inicialização
   - Protege contra tokens de ambientes diferentes

5. **`frontend/src/services/api.ts`** (Web)
   - Integrado `handleInvalidToken()` em erros 401
   - Limpa sessão automaticamente quando detecta token inválido

6. **`docs/ENVIRONMENT_SYNC_GUIDE.md`** (Documentação)
   - Guia completo de configuração por ambiente
   - Checklist de sincronização
   - Troubleshooting
   - Tabela de mapeamento de ambientes

---

## 🔒 Como funciona a proteção

### Web (Create React App)

1. **Na inicialização:**
   - Lê fingerprint do ambiente atual (URL + prefixo da chave)
   - Compara com fingerprint armazenado no `localStorage`
   - Se diferente → limpa `localStorage` e sessão do Supabase

2. **Em erros 401:**
   - Quando recebe erro de token inválido
   - Chama `handleInvalidToken()`
   - Limpa todos os dados de autenticação

### Mobile (Expo/React Native)

1. **Na inicialização:**
   - Obtém sessão atual do Supabase
   - Extrai URL do issuer do JWT (token)
   - Compara com URL configurada nas variáveis de ambiente
   - Se diferente → limpa sessão do Supabase

2. **Em erros 401:**
   - Quando recebe erro de token inválido
   - Chama `handleInvalidToken()`
   - Limpa sessão do Supabase (que usa AsyncStorage internamente)

---

## 📋 Configuração necessária

### Variáveis de Ambiente

Cada ambiente precisa ter suas próprias variáveis configuradas:

#### Local
- Frontend: `.env.local` → `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`
- Backend: `.env` → `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- Mobile: `.env.local` → `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`

#### Staging
- Frontend: Vercel → Environment Variables (Preview: staging)
- Backend: Render → Environment
- Mobile: `eas.json` → build profile `staging`

#### Produção
- Frontend: Vercel → Environment Variables (Production)
- Backend: Render → Environment (Production)
- Mobile: `eas.json` → build profile `production`

**Regra de Ouro:** Frontend e Backend DEVEM usar o MESMO projeto Supabase em cada ambiente!

---

## 🔄 Sincronização de Dados

### Garantias

1. **Migrations automáticas:**
   - GitHub Actions workflow (`.github/workflows/supabase-migrations.yml`)
   - Aplica migrations automaticamente ao fazer push para `staging` ou `main`

2. **Validação de ambiente:**
   - O sistema detecta automaticamente se tokens são de outro ambiente
   - Limpa sessão para forçar login no ambiente correto

3. **Documentação:**
   - Guia completo em `docs/ENVIRONMENT_SYNC_GUIDE.md`
   - Checklist de verificação
   - Troubleshooting

---

## ✅ Checklist de Deploy

Antes de fazer deploy para staging/produção:

- [ ] Variáveis de ambiente configuradas no Vercel (web)
- [ ] Variáveis de ambiente configuradas no Render (backend)
- [ ] Variáveis de ambiente configuradas no EAS (mobile, se aplicável)
- [ ] Frontend e Backend usando o **mesmo projeto Supabase**
- [ ] Migrations aplicadas no banco correspondente
- [ ] Testado login/logout no ambiente de destino
- [ ] Verificado que tokens funcionam corretamente

---

## 🚨 Problemas Comuns

### Token inválido mesmo após configuração correta

**Solução:**
1. Web: Limpar `localStorage` no navegador
2. Mobile: Reinstalar app ou limpar dados
3. Fazer logout e login novamente

### Dados não aparecem no mobile mas aparecem no web

**Causa:** Mobile usando projeto Supabase diferente

**Verificação:**
- Compare `EXPO_PUBLIC_SUPABASE_URL` (mobile) com `REACT_APP_SUPABASE_URL` (web)
- Devem ser **idênticas** para o mesmo ambiente

**Solução:**
1. Atualizar `eas.json` com variáveis corretas
2. Fazer novo build: `eas build --profile staging`

---

## 📚 Arquivos Relacionados

- `frontend/src/utils/envGuard.ts` - Guard para web
- `frontend/utils/envGuard.ts` - Guard para mobile
- `frontend/src/services/api.ts` - Integração com API (web)
- `frontend/src/App.tsx` - App principal web
- `frontend/App.tsx` - App principal mobile
- `docs/ENVIRONMENT_SYNC_GUIDE.md` - Documentação completa

---

**Última atualização:** 2025-10-31



