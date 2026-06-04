# Correção de Envio de Email em Staging

## Problema

Em staging, os emails de confirmação não estavam sendo recebidos após criar uma clínica, mesmo recebendo status 201 (sucesso).

## Causa Raiz

O código em `createClinicPublic.ts` estava usando:
```typescript
supabaseAdmin.auth.admin.createUser({
  email_confirm: true, // ❌ Isso NÃO envia email!
})
```

**Problema:** `email_confirm: true` apenas marca o email como confirmado, mas **NÃO envia email automaticamente**. O Supabase não envia email quando você usa `admin.createUser()` diretamente.

## Solução Implementada

### 1. Mudança no Código (`backend/src/controllers/clinics/createClinicPublic.ts`)

**Antes:**
```typescript
email_confirm: true, // ❌ Não envia email
```

**Depois:**
```typescript
email_confirm: false, // ✅ Não confirmar automaticamente

// Adicionado: Gerar link de confirmação que envia email
const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
  type: 'signup',
  email,
  password,
  options: {
    redirectTo: emailRedirectTo,
  },
});
```

### 2. Validação de FRONTEND_URL

Adicionada validação para garantir que `FRONTEND_URL` está configurada antes de criar o usuário:
```typescript
if (!FRONTEND_URL) {
  return res.status(500).json({ error: 'FRONTEND_URL não configurada no servidor' });
}
const emailRedirectTo = `${FRONTEND_URL}/email-confirmed`;
```

## Como Funciona Agora

1. ✅ Usuário é criado com `email_confirm: false` (não confirmado)
2. ✅ Link de confirmação é gerado usando `admin.generateLink()`
3. ✅ Supabase envia email automaticamente quando geramos o link de tipo `signup`
4. ✅ Email contém link que redireciona para `${FRONTEND_URL}/email-confirmed`

## Verificação Necessária no Render (Staging)

Certifique-se de que estas variáveis estão configuradas:

```env
NODE_ENV=staging
FRONTEND_URL=https://peti-vet-git-staging-petivet.vercel.app
SUPABASE_URL=[URL do Supabase Staging]
SUPABASE_SERVICE_ROLE_KEY=[Service Role Key]
```

## Verificação no Supabase Dashboard

1. **Authentication → URL Configuration:**
   - Site URL: `https://peti-vet-git-staging-petivet.vercel.app`
   - Redirect URLs: Adicione `https://peti-vet-git-staging-petivet.vercel.app/email-confirmed`

2. **Authentication → Email Templates:**
   - Verifique se o template "Confirm signup" está ativo

3. **Authentication → Providers → Email:**
   - Verifique se email está habilitado
   - Em staging, pode precisar configurar SMTP customizado

## Próximos Passos

1. ✅ Código corrigido
2. ⏳ Fazer commit e push para staging
3. ⏳ Render fará deploy automaticamente
4. ⏳ Verificar logs do Render após deploy
5. ⏳ Testar criação de clínica em staging
6. ⏳ Verificar recebimento de email

## Logs Esperados

Após o deploy, você deve ver nos logs do Render:

```
[SIGNUP] Using emailRedirectTo: https://peti-vet-git-staging-petivet.vercel.app/email-confirmed
[SIGNUP] Link de confirmação gerado com sucesso
[SIGNUP] Link gerado (email deve ter sido enviado): https://...
```

Se aparecer erro, verifique:
- Se `FRONTEND_URL` está configurada no Render
- Se o Supabase tem permissão para enviar emails
- Se há rate limits no Supabase

## Nota Importante

Se mesmo após esta correção o email não for enviado, pode ser necessário:
1. Configurar SMTP customizado no Supabase (Authentication → Settings → SMTP)
2. Verificar se há limites de rate limiting no plano do Supabase
3. Considerar usar serviço de email externo (SendGrid, Resend, etc.)

