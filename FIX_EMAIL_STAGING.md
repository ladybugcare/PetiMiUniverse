# 🔧 Correção: Email de Confirmação no Staging

## 🐛 Problema Identificado

Quando você clica no link de confirmação de email no staging, a URL está assim:
```
https://supabase.co/auth/v1/verify?...&redirect_to=FRONTEND_URL%3Dhttp%3A%2F%2Flocalhost%3A3002
```

**Problemas:**
1. ❌ `FRONTEND_URL` não foi substituído (aparece literal)
2. ❌ Está apontando para `localhost:3002` em vez do Vercel
3. ❌ Resultado: Token expira e retorna erro 403

---

## ✅ Solução: Configurar URLs no Supabase

### Passo 1: Acessar Configurações do Supabase

1. Acesse: https://app.supabase.com
2. Selecione seu projeto de **STAGING** (petivet-staging)
3. Vá em **Authentication** → **URL Configuration**

### Passo 2: Configurar Site URL

Na seção **Site URL**, configure:

```
https://peti-vet-git-staging-petivet.vercel.app
```

⚠️ **IMPORTANTE**: Use exatamente a URL que você vê no Vercel para staging.

### Passo 3: Adicionar Redirect URLs

Na seção **Redirect URLs**, adicione as seguintes URLs (uma por linha):

```
https://peti-vet-git-staging-petivet.vercel.app/*
https://peti-vet-git-staging-petivet.vercel.app/email-confirmed
https://peti-vet-git-staging-petivet.vercel.app/units/create-first
http://localhost:3002/*
http://localhost:3002/email-confirmed
```

A última linha com `localhost` é opcional, mas útil para testes locais.

### Passo 4: Configurar Email Templates (Opcional)

Se quiser garantir que o template está correto:

1. Vá em **Authentication** → **Email Templates**
2. Selecione **Confirm signup**
3. Verifique se o link de confirmação usa `{{ .ConfirmationURL }}`
4. O template padrão já deve estar correto

### Passo 5: Salvar e Testar

1. Clique em **Save** nas configurações
2. Aguarde alguns segundos para as mudanças propagarem
3. Teste criando uma nova conta

---

## 🧪 Como Testar

### 1. Criar Nova Conta

1. Acesse: https://peti-vet-git-staging-petivet.vercel.app
2. Clique em "Cadastrar Clínica"
3. Preencha o formulário de 5 passos
4. Submeta o formulário

### 2. Verificar Email

1. Abra seu email
2. Procure o email de confirmação do Supabase
3. **ANTES de clicar**, inspecione o link (hover sobre ele)
4. Verifique se a URL de redirecionamento está correta

### 3. Confirmar Conta

1. Clique no link de confirmação
2. Você deve ser redirecionado para: 
   ```
   https://peti-vet-git-staging-petivet.vercel.app/email-confirmed
   ```
3. Após 2 segundos, redirecionamento automático para criar primeira unidade

### 4. Verificar Sucesso

✅ Sem erros 403
✅ Redirecionamento correto
✅ Pode fazer login normalmente

---

## 🔍 Verificação de URLs

Depois de configurar, suas URLs no Supabase devem estar assim:

### Site URL
```
https://peti-vet-git-staging-petivet.vercel.app
```

### Redirect URLs (lista completa)
```
https://peti-vet-git-staging-petivet.vercel.app/*
https://peti-vet-git-staging-petivet.vercel.app/email-confirmed
https://peti-vet-git-staging-petivet.vercel.app/units/create-first
```

---

## 🚨 Troubleshooting

### Erro: "Email link is invalid or has expired"

**Causa:** Link de confirmação expirou (padrão: 24 horas)

**Solução:**
1. Na página de signup, use o botão "Reenviar e-mail de confirmação"
2. Ou cadastre novamente com outro email
3. Clique no link **imediatamente** após receber

### Erro: "Redirect URL not allowed"

**Causa:** URL não está na lista de Redirect URLs permitidas

**Solução:**
1. Volte ao Supabase → Authentication → URL Configuration
2. Adicione a URL exata que está sendo usada
3. Salve e aguarde propagação (~30 segundos)

### Email não chega

**Soluções:**
1. Verificar pasta de spam
2. Verificar se o email está correto
3. Usar botão "Reenviar e-mail"
4. Se persistir, verificar logs do Supabase em **Logs** → **Auth Logs**

### Ainda aparece localhost na URL

**Causa:** Cache do navegador ou configurações antigas

**Solução:**
1. Limpar cache do navegador
2. Abrir em aba anônima
3. Verificar se salvou as configurações no Supabase
4. Aguardar alguns minutos para propagação

---

## 📋 Checklist de Configuração

- [ ] Site URL configurada no Supabase
- [ ] Redirect URLs adicionadas no Supabase
- [ ] URLs salvas no Supabase
- [ ] Aguardado propagação (30s - 1min)
- [ ] Testado com nova conta
- [ ] Email recebido com URL correta
- [ ] Confirmação funcionou sem erro 403
- [ ] Redirecionamento automático funcionou

---

## 🎯 URLs de Referência

### Staging
- **Frontend**: https://peti-vet-git-staging-petivet.vercel.app
- **Backend**: https://petivet-api-staging.onrender.com  
- **Supabase**: https://app.supabase.com/project/[seu-project-id]

### Local (para comparação)
- **Frontend**: http://localhost:3002
- **Backend**: http://localhost:3000

---

## 💡 Dica Pro

Para evitar que links expirem durante testes:

1. No Supabase, vá em **Authentication** → **Providers** → **Email**
2. Em **Email Confirmation**, você pode:
   - Aumentar o tempo de expiração do link
   - Ou desabilitar confirmação de email (apenas para staging/testes)

⚠️ **Não desabilite confirmação em produção!**

---

## ✨ Após Corrigir

Quando tudo estiver funcionando:

1. Documente as URLs finais usadas
2. Atualize o arquivo `STAGING_SUCCESS.md` com as URLs corretas
3. Teste o fluxo completo de signup → email → confirmação → login
4. Compartilhe com a equipe que o staging está pronto

---

*Última atualização: Correção de configuração de email no staging*
*Status: Aguardando configuração no Supabase*

