# Troubleshooting de Email em Staging

## Problema Identificado

Em staging, os emails de confirmação não estão sendo recebidos após criar uma clínica, mesmo recebendo status 201 (sucesso).

## Causa Raiz

O código estava usando `supabaseAdmin.auth.admin.createUser()` com `email_confirm: true`, mas isso **NÃO envia email automaticamente**. O `email_confirm: true` apenas marca o email como confirmado, mas não dispara o envio.

## Solução Implementada

1. **Mudança em `createClinicPublic.ts`:**
   - Alterado `email_confirm: true` para `email_confirm: false`
   - Adicionado código para gerar link de confirmação usando `admin.generateLink()`
   - O Supabase envia o email automaticamente quando geramos o link de tipo `signup`

2. **Verificação de FRONTEND_URL:**
   - Adicionada validação para garantir que `FRONTEND_URL` está configurada
   - URL de redirecionamento: `${FRONTEND_URL}/email-confirmed`

## Configuração Necessária no Render (Staging)

Certifique-se de que as seguintes variáveis estão configuradas:

```env
NODE_ENV=staging
FRONTEND_URL=https://peti-vet-git-staging-petivet.vercel.app
SUPABASE_URL=[URL do Supabase Staging]
SUPABASE_ANON_KEY=[Anon Key]
SUPABASE_SERVICE_ROLE_KEY=[Service Role Key]
```

## Configuração no Supabase Dashboard

1. **Authentication → URL Configuration:**
   - **Site URL**: `https://peti-vet-git-staging-petivet.vercel.app`
   - **Redirect URLs**: Adicione:
     - `https://peti-vet-git-staging-petivet.vercel.app/email-confirmed`
     - `https://peti-vet-git-staging-petivet.vercel.app/**`

2. **Authentication → Email Templates:**
   - Verifique se o template "Confirm signup" está configurado
   - O link de confirmação deve redirecionar para `/email-confirmed`

3. **Authentication → Providers → Email:**
   - Verifique se o email está habilitado
   - Em staging, pode estar usando SMTP customizado ou o serviço padrão do Supabase

## Verificação de Logs

Após fazer deploy, verifique os logs do Render para ver se há mensagens como:

```
[SIGNUP] Link de confirmação gerado com sucesso
[SIGNUP] Email de confirmação enviado com sucesso
```

Se aparecer erro, verifique:
- Se `FRONTEND_URL` está configurada corretamente
- Se o Supabase tem permissão para enviar emails
- Se há limites de rate limiting no Supabase

## Teste Manual

1. Crie uma nova clínica em staging
2. Verifique os logs do backend no Render
3. Verifique se o email chegou (incluindo spam)
4. Se não chegou, verifique:
   - Configuração de SMTP no Supabase
   - Rate limits do Supabase
   - Logs de erro no Render

## Alternativas se Email Não Funcionar

Se mesmo após a correção o email não for enviado, considere:

1. **Usar serviço de email externo:**
   - SendGrid
   - Resend
   - AWS SES
   - Integrar via webhook do Supabase

2. **Verificar configuração SMTP no Supabase:**
   - Authentication → Settings → SMTP Settings
   - Pode precisar configurar SMTP customizado para staging/produção

## Próximos Passos

1. ✅ Código corrigido para gerar link de confirmação
2. ⏳ Fazer deploy em staging
3. ⏳ Verificar logs após deploy
4. ⏳ Testar criação de clínica
5. ⏳ Verificar recebimento de email

