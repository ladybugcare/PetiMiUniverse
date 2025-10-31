# 🔧 Correção: Erros de Token e Email - Projeto Supabase

## 🐛 Problema Identificado

**Sintomas:**
- ❌ "Token inválido ou expirado" ao tentar cadastrar unidade
- ❌ Erro ao confirmar email
- ❌ Tokens gerados no frontend não funcionam no backend

**Causa Raiz:**
Usar o **mesmo projeto Supabase** para local e produção/staging causa conflitos porque:
1. Tokens do Supabase são **específicos por projeto**
2. Se frontend usa projeto A e backend usa projeto B → token inválido
3. URLs de confirmação de email precisam estar no projeto correto

---

## ✅ Solução: Configurar Projetos Separados

### 📋 Estratégia Recomendada

Você deve ter **3 projetos Supabase diferentes**:

1. **Local/Dev** - Para desenvolvimento na sua máquina
2. **Staging** - Para testes antes de produção  
3. **Produção** - Para usuários reais

**NÃO use o mesmo projeto para múltiplos ambientes!**

---

## 🔍 Passo 1: Diagnosticar o Problema

### 1.1 Verificar Configuração do Frontend

Verifique o arquivo `.env.local` (ou variáveis no Vercel):

```bash
# Frontend - frontend/.env.local
REACT_APP_SUPABASE_URL=https://xxxxx.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGc...
REACT_APP_API_URL=http://localhost:3000
```

**No navegador (DevTools → Console):**
```javascript
// Verificar qual URL o frontend está usando
console.log(process.env.REACT_APP_SUPABASE_URL);
```

### 1.2 Verificar Configuração do Backend

Verifique o arquivo `backend/.env` (ou variáveis no Render):

```bash
# Backend - backend/.env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

**No backend (logs):**
```javascript
// Em backend/src/config/supabase.ts
console.log('Supabase URL:', process.env.SUPABASE_URL);
```

### 1.3 Comparar URLs

**⚠️ IMPORTANTE:** As URLs devem ser **EXATAMENTE IGUAIS**:

- `REACT_APP_SUPABASE_URL` (frontend) = `SUPABASE_URL` (backend)
- `REACT_APP_SUPABASE_ANON_KEY` (frontend) = `SUPABASE_ANON_KEY` (backend)

Se forem diferentes → **ESSE É O PROBLEMA!**

---

## 🔧 Passo 2: Corrigir Configuração Local

### 2.1 Criar Projeto Supabase Local (Se não existir)

1. Acesse: https://app.supabase.com
2. Crie novo projeto: `petivet-local` ou `petivet-dev`
3. Região: South America (São Paulo)
4. Copie as credenciais:
   - Project URL
   - anon/public key
   - service_role key (backend apenas)

### 2.2 Atualizar Frontend Local

**Arquivo:** `frontend/.env.local`

```env
# ✅ Use o mesmo projeto que o backend!
REACT_APP_SUPABASE_URL=https://[seu-projeto-local].supabase.co
REACT_APP_SUPABASE_ANON_KEY=[anon-key-do-projeto-local]
REACT_APP_API_URL=http://localhost:3000
```

### 2.3 Atualizar Backend Local

**Arquivo:** `backend/.env`

```env
# ✅ Use o mesmo projeto que o frontend!
SUPABASE_URL=https://[seu-projeto-local].supabase.co
SUPABASE_ANON_KEY=[anon-key-do-projeto-local]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key-do-projeto-local]
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

### 2.4 Limpar Tokens Antigos

No navegador, execute:
```javascript
localStorage.clear();
sessionStorage.clear();
```

**Reinicie o servidor de desenvolvimento:**
```bash
# Backend
cd backend
npm run dev

# Frontend (em outro terminal)
cd frontend
npm start
```

---

## 🔧 Passo 3: Corrigir Configuração de Staging

### 3.1 Verificar Projeto Staging no Supabase

1. Acesse: https://app.supabase.com
2. Certifique-se de ter projeto separado: `petivet-staging`
3. Se não tiver, crie um novo

### 3.2 Configurar Variáveis no Vercel (Frontend)

1. Acesse: https://vercel.com
2. Projeto → Settings → Environment Variables
3. Configure para ambiente **Preview** (branch staging):

```
REACT_APP_SUPABASE_URL=https://[projeto-staging].supabase.co
REACT_APP_SUPABASE_ANON_KEY=[anon-key-staging]
REACT_APP_API_URL=https://petivet-api-staging.onrender.com
```

### 3.3 Configurar Variáveis no Render (Backend)

1. Acesse: https://dashboard.render.com
2. Serviço → Environment
3. Configure:

```
SUPABASE_URL=https://[projeto-staging].supabase.co
SUPABASE_ANON_KEY=[anon-key-staging]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key-staging]
FRONTEND_URL=https://staging.petivet.vercel.app
```

### 3.4 Configurar URLs de Redirecionamento no Supabase

1. No Supabase Dashboard → Authentication → URL Configuration
2. **Site URL**: `https://staging.petivet.vercel.app`
3. **Redirect URLs**:
   ```
   https://staging.petivet.vercel.app/*
   https://staging.petivet.vercel.app/email-confirmed
   https://staging.petivet.vercel.app/units/create-first
   ```

---

## 🔧 Passo 4: Corrigir Configuração de Produção

### 4.1 Criar/Verificar Projeto Produção

1. Projeto separado: `petivet-production` ou `petivet-prod`
2. **NUNCA use o mesmo projeto de staging!**

### 4.2 Configurar no Vercel (Produção)

Variáveis para ambiente **Production**:

```
REACT_APP_SUPABASE_URL=https://[projeto-producao].supabase.co
REACT_APP_SUPABASE_ANON_KEY=[anon-key-producao]
REACT_APP_API_URL=https://petivet-api.onrender.com
```

### 4.3 Configurar no Render (Produção)

```
SUPABASE_URL=https://[projeto-producao].supabase.co
SUPABASE_ANON_KEY=[anon-key-producao]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key-producao]
FRONTEND_URL=https://petivet.vercel.app
```

---

## 🧪 Passo 5: Testar a Correção

### 5.1 Teste Local

1. Limpe localStorage: `localStorage.clear()`
2. Faça logout/login novamente
3. Tente cadastrar primeira unidade
4. Verifique console - não deve ter erro de token

### 5.2 Teste Email Local

1. Crie nova conta de clínica
2. Verifique email recebido
3. Clique no link de confirmação
4. Deve redirecionar para `/email-confirmed`
5. Deve salvar token corretamente

### 5.3 Debug no Console

**Frontend:**
```javascript
// Verificar qual Supabase está sendo usado
import { supabase } from './services/supabase';
console.log('Supabase URL:', supabase.supabaseUrl);

// Verificar token atual
const { data: { session } } = await supabase.auth.getSession();
console.log('Token:', session?.access_token?.substring(0, 20) + '...');
```

**Backend:**
```javascript
// Em authMiddleware.ts, adicionar log temporário
console.log('Validating token against:', process.env.SUPABASE_URL);
console.log('Token (first 20 chars):', token.substring(0, 20));
```

---

## 🚨 Problemas Comuns e Soluções

### ❌ "Token inválido" mesmo depois de corrigir

**Solução:**
1. Verifique se frontend e backend estão usando a MESMA URL do Supabase
2. Limpe localStorage: `localStorage.clear()`
3. Faça logout e login novamente
4. Verifique se o token não expirou (tokens JWT expiram em ~1h)

### ❌ Email não chega

**Solução:**
1. Verifique pasta de spam
2. No Supabase → Authentication → Email Templates
3. Verifique se o template está configurado
4. Teste com email diferente
5. Verifique rate limits do Supabase (free tier tem limite)

### ❌ URL de confirmação redireciona para localhost

**Solução:**
1. No Supabase → Authentication → URL Configuration
2. Atualize **Site URL** para URL correta (staging ou produção)
3. Adicione **Redirect URLs** corretas
4. Aguarde 1-2 minutos para propagação

### ❌ Erro "Invalid API key"

**Solução:**
1. Verifique se as chaves estão corretas (copiar/colar completo)
2. Certifique-se de usar **anon key** no frontend (não service role!)
3. Backend pode usar anon key OU service role key (depende da operação)

---

## 📊 Checklist Final

### Configuração Local
- [ ] Frontend `.env.local` tem `REACT_APP_SUPABASE_URL`
- [ ] Backend `.env` tem `SUPABASE_URL`
- [ ] URLs são **idênticas** entre frontend e backend
- [ ] Chaves anon são **idênticas**
- [ ] Backend tem `SUPABASE_SERVICE_ROLE_KEY`

### Configuração Staging
- [ ] Vercel tem variáveis para Preview (staging)
- [ ] Render tem variáveis para staging
- [ ] Supabase staging configurado com URLs corretas
- [ ] Projeto staging separado do local

### Configuração Produção
- [ ] Vercel tem variáveis para Production
- [ ] Render tem variáveis para produção
- [ ] Supabase produção configurado
- [ ] Projeto produção separado do staging

### Testes
- [ ] Login funciona localmente
- [ ] Cadastro de unidade funciona
- [ ] Email de confirmação chega e funciona
- [ ] Token é válido por 1h+
- [ ] Sem erros no console

---

## 💡 Dica: Script de Verificação

Crie um arquivo `scripts/check-supabase-config.js`:

```javascript
// Verifica se as configurações estão consistentes
const frontendUrl = process.env.REACT_APP_SUPABASE_URL;
const backendUrl = process.env.SUPABASE_URL;

if (frontendUrl !== backendUrl) {
  console.error('❌ URLs diferentes!', { frontendUrl, backendUrl });
  process.exit(1);
}

console.log('✅ URLs consistentes:', frontendUrl);
```

---

## 📝 Resumo

**Regra de Ouro:** 
> Frontend e Backend DEVEM usar o MESMO projeto Supabase em cada ambiente!

**Por ambiente:**
- **Local**: 1 projeto Supabase para dev
- **Staging**: 1 projeto Supabase separado  
- **Produção**: 1 projeto Supabase separado

**Nunca misture:**
- ❌ Usar projeto de staging em produção
- ❌ Usar projeto local em staging
- ❌ Frontend usando projeto A e backend usando projeto B

