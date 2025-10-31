# 🔧 Correção: Invalid API Key no Staging

## 🐛 Problema Identificado

Ao tentar criar conta no staging, o erro no console mostra:
```json
{error: "Invalid API key"}
```

**Causa:** As variáveis de ambiente do Supabase não estão configuradas corretamente no Vercel para o projeto de staging.

---

## ✅ Solução: Configurar Variáveis de Ambiente no Vercel

### Passo 1: Obter Credenciais do Supabase

1. Acesse: https://app.supabase.com
2. Selecione seu projeto **STAGING** (petivet-staging ou similar)
3. Vá em **Settings** (⚙️) → **API**
4. Copie as seguintes informações:

```
Project URL: https://[seu-projeto-id].supabase.co
anon public key: eyJhbGc... (chave longa)
```

⚠️ **IMPORTANTE:** Use as credenciais do projeto de **STAGING**, não de produção!

---

### Passo 2: Configurar no Vercel

1. Acesse: https://vercel.com
2. Selecione o projeto **PetiVet**
3. Vá em **Settings** → **Environment Variables**

#### Adicionar/Editar Variáveis:

**Variável 1:**
```
Name: REACT_APP_SUPABASE_URL
Value: https://[seu-projeto-id].supabase.co
Environment: Preview (branch staging)
```

**Variável 2:**
```
Name: REACT_APP_SUPABASE_ANON_KEY
Value: eyJhbGc... (a chave anon que você copiou)
Environment: Preview (branch staging)
```

**Variável 3:**
```
Name: REACT_APP_API_URL
Value: https://petivet-api-staging.onrender.com
Environment: Preview (branch staging)
```

⚠️ **Atenção ao Environment:**
- Selecione **Preview** e especifique a branch **staging**
- NÃO selecione "Production" para essas variáveis de staging

---

### Passo 3: Redeploy do Frontend

Depois de salvar as variáveis:

1. Vá em **Deployments**
2. Encontre o último deploy da branch `staging`
3. Clique nos três pontos (...) → **Redeploy**
4. Aguarde o deploy completar (~2-3 minutos)

---

## 🔍 Verificar Configuração

### Checklist de Variáveis no Vercel

No Vercel → Settings → Environment Variables, você deve ter:

```
REACT_APP_SUPABASE_URL          [Preview: staging]
REACT_APP_SUPABASE_ANON_KEY     [Preview: staging]
REACT_APP_API_URL               [Preview: staging]
```

### Verificar no Browser

Depois do redeploy:

1. Abra: https://peti-vet-git-staging-petivet.vercel.app
2. Abra DevTools (F12)
3. Console, digite:
   ```javascript
   console.log(process.env.REACT_APP_SUPABASE_URL)
   ```
4. Deve mostrar a URL do Supabase (não "undefined")

---

## 🧪 Testar Novamente

1. **Limpe o cache do navegador** (Ctrl+Shift+R ou Cmd+Shift+R)
2. Ou abra em **aba anônima**
3. Tente criar uma conta novamente
4. Verifique o Network tab - não deve mais ter erro "Invalid API key"

---

## 🚨 Troubleshooting

### Erro persiste após redeploy

**Solução:**
1. Verifique se as variáveis foram salvas corretamente
2. Certifique-se que selecionou "Preview" e especificou "staging"
3. Force um novo deploy fazendo um commit vazio:
   ```bash
   git commit --allow-empty -m "trigger redeploy"
   git push origin staging
   ```

### Não encontra o projeto no Vercel

**Solução:**
1. Verifique se está logado com a conta correta
2. Verifique se o projeto está linkado ao repositório
3. Se necessário, re-importar o projeto do GitHub

### Chave do Supabase não aparece completa

**Solução:**
1. No Supabase, clique no ícone de "copiar" ao lado da chave
2. Não tente copiar selecionando (pode cortar a chave)
3. Cole diretamente no Vercel

### Backend também dá erro de API key

Se o **backend** também der erro similar:

1. Acesse: https://dashboard.render.com
2. Selecione o serviço **petivet-api-staging**
3. Vá em **Environment**
4. Verifique se `SUPABASE_URL` e `SUPABASE_ANON_KEY` estão corretas
5. Se mudar algo, o Render fará redeploy automático

---

## 📋 Estrutura Completa de Variáveis

### Vercel (Frontend Staging)

```bash
# Supabase
REACT_APP_SUPABASE_URL=https://xxxxx.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# API Backend
REACT_APP_API_URL=https://petivet-api-staging.onrender.com
```

### Render (Backend Staging)

```bash
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...(diferente)

# Configurações
PORT=10000
NODE_ENV=staging
FRONTEND_URL=https://peti-vet-git-staging-petivet.vercel.app
```

---

## 💡 Dicas Importantes

### 1. Service Role vs Anon Key

- **Anon Key**: Usada no frontend (pública, segura)
- **Service Role Key**: Usada no backend (privada, nunca expor)

### 2. Diferentes Projetos Supabase

- **Staging**: Projeto separado para testes
- **Production**: Projeto principal (quando houver)
- NÃO misture as credenciais!

### 3. Verificar Environment

No Vercel, ao adicionar variável:
- ✅ Preview (staging branch)
- ❌ Production (quando for staging)

### 4. Cache do Browser

Sempre limpe o cache após mudanças:
- Chrome/Edge: Ctrl+Shift+R (Windows) ou Cmd+Shift+R (Mac)
- Ou use aba anônima

---

## ✨ Próximos Passos

Após corrigir as variáveis:

1. ✅ Redeploy no Vercel
2. ✅ Limpar cache do navegador
3. ✅ Testar cadastro de nova conta
4. ✅ Verificar que não há erro "Invalid API key"
5. ✅ Verificar que email de confirmação chega
6. ✅ Seguir o guia `FIX_EMAIL_STAGING.md` para configurar URLs de redirecionamento

---

## 📞 Suporte

Se após seguir todos os passos o erro persistir:

1. Verifique os logs do Vercel (Deployments → Ver logs)
2. Verifique os logs do Render (se backend também der erro)
3. Confirme que o projeto Supabase staging está ativo
4. Teste com as credenciais localmente primeiro

---

*Última atualização: Correção de Invalid API Key no staging*
*Status: Aguardando configuração de variáveis no Vercel*

